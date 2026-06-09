import { NextRequest, NextResponse } from "next/server";

const COMPONENTS_V2_FLAG = 1 << 15;
const V2_COMPONENT_TYPES = new Set([9, 10, 11, 12, 13, 14, 17]);
const INTERACTIVE_TYPES = new Set([3, 5, 6, 7, 8]);
const WEBHOOK_USERNAME = "BetterEmbeds";

function isDiscordWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    return ["discord.com", "ptb.discord.com", "canary.discord.com"].includes(url.hostname) && url.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

function hasV2Component(value: unknown): boolean {
  if (!Array.isArray(value)) return false;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const component = item as Record<string, unknown>;
    const type = Number(component.type);

    if (V2_COMPONENT_TYPES.has(type)) return true;
    if (hasV2Component(component.components)) return true;
  }

  return false;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined).filter((item) => item !== undefined);

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value)) {
      const cleaned = stripUndefined(child);
      if (cleaned !== undefined) output[key] = cleaned;
    }

    return output;
  }

  return value === undefined ? undefined : value;
}

function prepareWebhookComponents(value: unknown): unknown {
  if (!Array.isArray(value)) return [];

  const output: Record<string, unknown>[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const component = { ...(item as Record<string, unknown>) };
    const type = Number(component.type);

    if (INTERACTIVE_TYPES.has(type)) continue;

    if (type === 2) {
      const style = Number(component.style);
      const url = typeof component.url === "string" ? component.url.trim() : "";
      if (style !== 5 || !url) continue;
      delete component.custom_id;
    }

    if (type === 13) {
      const file = component.file;
      const fileUrl = file && typeof file === "object" ? String((file as Record<string, unknown>).url || "") : "";
      if (!fileUrl || fileUrl.startsWith("attachment://")) continue;
    }

    if (Array.isArray(component.components)) {
      component.components = prepareWebhookComponents(component.components);
      if ((component.components as unknown[]).length === 0 && type === 1) continue;
    }

    output.push(component);
  }

  return output;
}

function componentCount(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  let total = 0;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    total += 1;
    total += componentCount((item as Record<string, unknown>).components);
  }

  return total;
}

function isV2Payload(payload: Record<string, unknown>, force: boolean) {
  const flags = Number(payload.flags || 0);
  return force || (flags & COMPONENTS_V2_FLAG) === COMPONENTS_V2_FLAG || hasV2Component(payload.components);
}

function normalizeEmbeds(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.slice(0, 10).map((item) => {
    if (!item || typeof item !== "object") return item;
    const embed = { ...(item as Record<string, unknown>) };
    const author = embed.author && typeof embed.author === "object" ? { ...(embed.author as Record<string, unknown>) } : {};
    embed.author = { ...author, name: WEBHOOK_USERNAME };
    return embed;
  });
}

function extractDiscordError(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") return fallback;

  const data = body as Record<string, unknown>;
  const message = typeof data.message === "string" ? data.message : fallback;
  const errors = data.errors ? ` ${JSON.stringify(data.errors)}` : "";
  return `${message}${errors}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const webhookUrl = String(body.webhookUrl || "").trim();
    const payload = body.payload;
    const withComponents = Boolean(body.withComponents);
    const forceV2 = Boolean(body.forceV2);

    if (!webhookUrl || !isDiscordWebhookUrl(webhookUrl)) {
      return NextResponse.json({ ok: false, status: 400, error: "Invalid Discord webhook URL." }, { status: 400 });
    }

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ ok: false, status: 400, error: "Invalid JSON payload." }, { status: 400 });
    }

    const normalized = stripUndefined(payload) as Record<string, unknown>;
    const usesV2 = isV2Payload(normalized, forceV2);
    let discordPayload: Record<string, unknown>;

    if (usesV2) {
      const components = prepareWebhookComponents(normalized.components);

      if (!Array.isArray(components) || components.length === 0) {
        return NextResponse.json(
          { ok: false, status: 400, error: "Components V2 needs at least one webhook-safe component. Use Text Display, Container, Section, Media Gallery, Separator, or link buttons." },
          { status: 400 }
        );
      }

      const count = componentCount(components);
      if (count > 40) {
        return NextResponse.json({ ok: false, status: 400, error: `Discord allows up to 40 components. This message has ${count}.` }, { status: 400 });
      }

      discordPayload = {
        username: WEBHOOK_USERNAME,
        flags: COMPONENTS_V2_FLAG,
        components
      };
    } else {
      const components = Array.isArray(normalized.components) ? prepareWebhookComponents(normalized.components) : undefined;
      discordPayload = { ...normalized, username: WEBHOOK_USERNAME };
      if (Array.isArray(normalized.embeds)) discordPayload.embeds = normalizeEmbeds(normalized.embeds);
      if (Array.isArray(components) && components.length > 0) discordPayload.components = components;
      else delete discordPayload.components;
    }

    const url = new URL(webhookUrl);
    if (usesV2 || Array.isArray(discordPayload.components)) url.searchParams.set("with_components", "true");
    url.searchParams.set("wait", "true");

    const discordResponse = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(discordPayload)
    });

    const text = await discordResponse.text();
    let discordBody: unknown = null;

    if (text) {
      try {
        discordBody = JSON.parse(text);
      } catch {
        discordBody = text;
      }
    }

    if (!discordResponse.ok) {
      return NextResponse.json(
        { ok: false, status: discordResponse.status, error: extractDiscordError(discordBody, `Discord returned ${discordResponse.status}.`), response: discordBody, sent: discordPayload },
        { status: 200 }
      );
    }

    return NextResponse.json({ ok: true, status: discordResponse.status, response: discordBody });
  } catch (error) {
    return NextResponse.json(
      { ok: false, status: 500, error: error instanceof Error ? error.message : "Unexpected server error." },
      { status: 500 }
    );
  }
}
