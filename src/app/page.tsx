"use client";

import { useMemo, useRef, useState } from "react";

type Mode = "embed" | "v2" | "json";
type JsonPayload = Record<string, unknown>;
type DiscordButton = {
  id: string;
  label: string;
  emoji: string;
  buttonType: "link" | "primary" | "secondary" | "success" | "danger";
  url?: string;
  customId?: string;
};
type GalleryItem = { id: string; url: string };
type EmbedField = { id: string; name: string; value: string; inline: boolean };
type EmbedBlock = {
  id: string;
  title: string;
  description: string;
  color: string;
  url: string;
  thumbnail: string;
  image: string;
  footer: string;
  fields: EmbedField[];
};

const COMPONENTS_V2_FLAG = 1 << 15;
const DISPLAY_TYPES = new Set([9, 10, 11, 12, 13, 14, 17]);
const BOT_NAME = "BetterEmbeds";

function id() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

function trim(value: string) {
  return value.trim();
}

function hexToNumber(value: string) {
  const parsed = Number.parseInt(trim(value).replace("#", "") || "5865F2", 16);
  return Number.isFinite(parsed) ? parsed : 0x5865f2;
}

function numberToHex(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "#5865F2";
  return `#${value.toString(16).padStart(6, "0").slice(-6)}`;
}

function emoji(value: string) {
  const name = trim(value);
  return name ? { name } : undefined;
}

function dropEmpty<T extends Record<string, unknown>>(object: T) {
  const next = { ...object };
  for (const key of Object.keys(next)) {
    const value = next[key];
    if (value === undefined || value === null || value === "") delete next[key];
    if (Array.isArray(value) && value.length === 0) delete next[key];
  }
  return next;
}

function hasV2Component(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const component = item as Record<string, unknown>;
    if (DISPLAY_TYPES.has(Number(component.type))) return true;
    if (hasV2Component(component.components)) return true;
  }
  return false;
}

function isV2Payload(payload: JsonPayload) {
  const flags = Number(payload.flags || 0);
  return (flags & COMPONENTS_V2_FLAG) === COMPONENTS_V2_FLAG || hasV2Component(payload.components);
}

function stripHeading(text: string) {
  return text.replace(/^#{1,6}\s*/, "");
}

function textFromComponent(component: Record<string, unknown>) {
  return typeof component.content === "string" ? component.content : "";
}

function defaultEmbed(): EmbedBlock {
  return {
    id: id(),
    title: "Welcome to BetterEmbeds 👋",
    description: "Thanks for purchasing BetterEmbeds. Build clean Discord embeds, preview them, export JSON, or send them directly with your webhook.",
    color: "#5865F2",
    url: "",
    thumbnail: "https://cdn.discordapp.com/embed/avatars/0.png",
    image: "",
    footer: "Made by: ashwa_o",
    fields: [
      { id: id(), name: "What's included? 📦", value: "Embed V1, Components V2, JSON editor and webhook sender.", inline: true },
      { id: id(), name: "Need help? 💬", value: "Use the buttons below to open your docs or support page.", inline: true }
    ]
  };
}

type SectionAccessoryType = "none" | "thumbnail" | "button";
type V2Component =
  | { id: string; type: "text_display"; content: string }
  | {
      id: string;
      type: "section";
      content: string;
      accessoryType: SectionAccessoryType;
      thumbnail: string;
      buttonLabel: string;
      buttonEmoji: string;
      buttonButtonType: DiscordButton["buttonType"];
      buttonUrl: string;
      buttonCustomId: string;
    }
  | { id: string; type: "separator"; divider: boolean; spacing: number }
  | { id: string; type: "action_row"; buttons: DiscordButton[] };

function getButtonStyle(buttonType: DiscordButton["buttonType"]) {
  switch (buttonType) {
    case "primary": return 1;
    case "secondary": return 2;
    case "success": return 3;
    case "danger": return 4;
    case "link": return 5;
    default: return 1;
  }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("embed");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const [customPayload, setCustomPayload] = useState<JsonPayload | null>(null);
  const [rawJson, setRawJson] = useState("");

  const [messageContent, setMessageContent] = useState("");
  const [embeds, setEmbeds] = useState<EmbedBlock[]>([defaultEmbed()]);

  const [accent, setAccent] = useState("#5865F2");
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [v2Components, setV2Components] = useState<V2Component[]>([
    { id: id(), type: "text_display", content: "## 👋 Welcome to BetterEmbeds" },
    { id: id(), type: "separator", divider: true, spacing: 1 },
    { id: id(), type: "text_display", content: "Thanks for purchasing BetterEmbeds. This message is built with Discord Components V2 using containers, text displays, sections, separators, media galleries, and link buttons." },
    { id: id(), type: "section", content: "### 🚀 Quick Start\nEdit the layout, paste your webhook, preview the message, then copy or send the JSON directly.", accessoryType: "thumbnail" as SectionAccessoryType, thumbnail: "https://cdn.discordapp.com/embed/avatars/0.png", buttonLabel: "", buttonEmoji: "🔗", buttonButtonType: "link", buttonUrl: "https://discord.com", buttonCustomId: "" }
  ]);
  const [includeGallery, setIncludeGallery] = useState(true);
  const [gallery, setGallery] = useState<GalleryItem[]>([
    { id: id(), url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=900&auto=format&fit=crop" },
    { id: id(), url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900&auto=format&fit=crop" }
  ]);
  const [buttons, setButtons] = useState<DiscordButton[]>([
    { id: id(), label: "Documentation", url: "https://discord.com/developers/docs/components/overview", emoji: "📘", buttonType: "link" },
    { id: id(), label: "Support", url: "https://discord.com", emoji: "💬", buttonType: "link" }
  ]);

  const embedPayload = useMemo<JsonPayload>(() => {
    const builtEmbeds = embeds.slice(0, 10).map((embed) =>
      dropEmpty({
        author: { name: BOT_NAME },
        title: trim(embed.title) || "BetterEmbeds",
        description: trim(embed.description) || "Write your embed message here.",
        url: trim(embed.url) || undefined,
        color: hexToNumber(embed.color),
        thumbnail: trim(embed.thumbnail) ? { url: trim(embed.thumbnail) } : undefined,
        image: trim(embed.image) ? { url: trim(embed.image) } : undefined,
        footer: trim(embed.footer) ? { text: trim(embed.footer) } : undefined,
        fields: embed.fields
          .map((field) => dropEmpty({ name: trim(field.name), value: trim(field.value), inline: field.inline }))
          .filter((field) => field.name && field.value)
          .slice(0, 25)
      })
    );

    const safeButtons = buttons
      .map((button) =>
        dropEmpty({
          type: 2,
          style: getButtonStyle(button.buttonType),
          label: trim(button.label) || "Open",
          url: button.buttonType === "link" ? trim(button.url || "") || "https://discord.com" : undefined,
          custom_id: button.buttonType !== "link" ? trim(button.customId || "") || id() : undefined,
          emoji: emoji(button.emoji)
        })
      )
      .slice(0, 5);

    return dropEmpty({
      username: BOT_NAME,
      content: trim(messageContent) || undefined,
      embeds: builtEmbeds,
      components: safeButtons.length ? [{ type: 1, components: safeButtons }] : undefined
    });
  }, [buttons, embeds, messageContent]);

  const v2Payload = useMemo<JsonPayload>(() => {
    const container: Record<string, unknown>[] = [];

    for (const component of v2Components) {
      if (component.type === "text_display") {
        container.push({ type: 10, content: trim(component.content) || "Write your message here." });
      } else if (component.type === "separator") {
        container.push({ type: 14, divider: component.divider, spacing: component.spacing });
      } else if (component.type === "section") {
        let accessory: Record<string, unknown> | undefined;
        if (component.accessoryType === "button") {
          accessory = dropEmpty({
            type: 2,
            style: getButtonStyle(component.buttonButtonType),
            label: trim(component.buttonLabel) || "Button",
            url: component.buttonButtonType === "link" ? trim(component.buttonUrl) || "https://discord.com" : undefined,
            custom_id: component.buttonButtonType !== "link" ? trim(component.buttonCustomId) || id() : undefined,
            emoji: emoji(component.buttonEmoji)
          });
        } else if (component.accessoryType === "thumbnail" && trim(component.thumbnail)) {
          accessory = { type: 11, media: { url: trim(component.thumbnail) }, description: "BetterEmbeds preview" };
        }
        container.push({
          type: 9,
          components: [{ type: 10, content: trim(component.content) || "### Quick Start" }],
          accessory
        });
      } else if (component.type === "action_row") {
        const rowButtons = component.buttons
          .map((button) =>
            dropEmpty({
              type: 2,
              style: getButtonStyle(button.buttonType),
              label: trim(button.label) || "Open",
              url: button.buttonType === "link" ? trim(button.url || "") || "https://discord.com" : undefined,
              custom_id: button.buttonType !== "link" ? trim(button.customId || "") || id() : undefined,
              emoji: emoji(button.emoji)
            })
          )
          .slice(0, 5);
        if (rowButtons.length) {
          container.push({ type: 1, components: rowButtons });
        }
      }
    }

    const galleryItems = gallery
      .map((item) => trim(item.url))
      .filter(Boolean)
      .slice(0, 10)
      .map((url) => ({ media: { url } }));

    if (includeGallery && galleryItems.length) {
      container.push({ type: 14, divider: true, spacing: 1 });
      container.push({ type: 12, items: galleryItems });
    }

    return {
      flags: COMPONENTS_V2_FLAG,
      components: [
        {
          type: 17,
          accent_color: hexToNumber(accent),
          components: container
        }
      ]
    };
  }, [accent, gallery, includeGallery, v2Components]);

  const builderPayload = mode === "v2" ? v2Payload : embedPayload;
  const payload = customPayload || builderPayload;
  const prettyJson = useMemo(() => JSON.stringify(payload, null, 2), [payload]);

  function switchMode(next: Mode) {
    setMode(next);
    setCustomPayload(null);
    if (next === "json") setRawJson(JSON.stringify(payload, null, 2));
  }

  function clearJson() {
    setRawJson("");
    setCustomPayload(null);
    setStatus({ text: "JSON cleared. Paste a new Discord payload whenever you want." });
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(rawJson) as JsonPayload;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The payload must be a JSON object.");
      setCustomPayload(parsed);
      setStatus({ text: "Custom JSON applied." });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Invalid JSON.", error: true });
    }
  }

  function useBuilderAgain() {
    setCustomPayload(null);
    setRawJson(JSON.stringify(builderPayload, null, 2));
    setStatus({ text: "Back to the visual builder." });
  }

  function clearContent() {
    setCustomPayload(null);
    setStatus(null);
    if (mode === "embed") {
      setMessageContent("");
      setEmbeds([defaultEmbed()]);
      setButtons([]);
    } else if (mode === "v2") {
      setV2Components([{ id: id(), type: "text_display", content: "" }]);
      setAccent("#5865F2");
      setGallery([]);
      setIncludeGallery(false);
    } else if (mode === "json") {
      setRawJson("");
    }
  }

  async function copyJson() {
    await navigator.clipboard.writeText(prettyJson);
    setStatus({ text: "JSON copied." });
  }

  function exportJson() {
    const blob = new Blob([prettyJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = isV2Payload(payload) ? "betterembeds-components-v2.json" : "betterembeds-embed-v1.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function sendWebhook() {
    if (!trim(webhookUrl)) {
      setStatus({ text: "Paste your Discord webhook URL first.", error: true });
      return;
    }

    let payloadToSend = payload;
    if (mode === "json" && trim(rawJson)) {
      try {
        const parsed = JSON.parse(rawJson) as JsonPayload;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The payload must be a JSON object.");
        payloadToSend = parsed;
        setCustomPayload(parsed);
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : "Invalid JSON.", error: true });
        return;
      }
    }

    setStatus({ text: "Sending..." });

    try {
      const response = await fetch("/api/send-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl,
          payload: payloadToSend,
          forceV2: isV2Payload(payloadToSend),
          withComponents: Array.isArray(payloadToSend.components)
        })
      });
      const data = await response.json();
      if (!data.ok) {
        setStatus({ text: data.error || `Discord returned ${data.status}.`, error: true });
        return;
      }
      setStatus({ text: "Message sent." });
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : "Could not send the message.", error: true });
    }
  }

  function updateEmbed(embedId: string, values: Partial<EmbedBlock>) {
    setCustomPayload(null);
    setEmbeds((current) => current.map((embed) => (embed.id === embedId ? { ...embed, ...values } : embed)));
  }

  function updateField(embedId: string, fieldId: string, values: Partial<EmbedField>) {
    setCustomPayload(null);
    setEmbeds((current) => current.map((embed) => embed.id === embedId ? { ...embed, fields: embed.fields.map((field) => field.id === fieldId ? { ...field, ...values } : field) } : embed));
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark imageMark"><img src="/betterembeds-logo.png" alt="BetterEmbeds logo" /></div>
          <div>
            <strong>BetterEmbeds</strong>
            <span>Discord message builder</span>
          </div>
        </div>
        <button className={mode === "embed" ? "active navButton" : "navButton"} onClick={() => switchMode("embed")}>Embed V1</button>
        <button className={mode === "v2" ? "active navButton" : "navButton"} onClick={() => switchMode("v2")}>Components V2</button>
        <button className={mode === "json" ? "active navButton" : "navButton"} onClick={() => switchMode("json")}>JSON</button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <h1>BetterEmbeds</h1>
            <p>Create Embed V1 and Components V2 messages with live preview, JSON export, and webhook sending.</p>
          </div>
          <div className="actions">
            <button onClick={copyJson}>Copy JSON</button>
            <button onClick={exportJson}>Export</button>
            <button className="primary" onClick={sendWebhook}>Send Webhook</button>
          </div>
        </header>

        <div className="webhookBar">
          <input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="Discord webhook URL" />
          <button onClick={clearContent} title="Clear current message content">Clear</button>
          {status && <span className={status.error ? "status error" : "status"}>{status.text}</span>}
        </div>

        <div className="mainGrid">
          <section className="editor">
            {customPayload && (
              <div className="panel customNotice">
                <div>
                  <h2>Custom JSON active</h2>
                  <p>The preview and sender are using the JSON you applied.</p>
                </div>
                <button onClick={useBuilderAgain}>Use builder</button>
              </div>
            )}

            {mode === "embed" && (
              <div className="panelStack">
                <div className="panel">
                  <div className="panelHead">
                    <div>
                      <h2>Embed V1 message</h2>
                      <p>Create up to 10 embeds in one Discord message.</p>
                    </div>
                    <button onClick={() => { setCustomPayload(null); setEmbeds((current) => [...current, defaultEmbed()].slice(0, 10)); }}>+ Add embed</button>
                  </div>
                  <label>Message content<textarea value={messageContent} onChange={(event) => { setCustomPayload(null); setMessageContent(event.target.value); }} placeholder="Optional normal message content" /></label>
                </div>

                {embeds.map((embed, index) => (
                  <div className="panel" key={embed.id}>
                    <div className="panelHead">
                      <div>
                        <h2>Embed {index + 1}</h2>
                        <p>Author is always {BOT_NAME}.</p>
                      </div>
                      <button onClick={() => setEmbeds((current) => current.filter((item) => item.id !== embed.id))} disabled={embeds.length === 1}>Remove</button>
                    </div>
                    <div className="formGrid two">
                      <label>Title<input value={embed.title} onChange={(event) => updateEmbed(embed.id, { title: event.target.value })} /></label>
                      <label>Color<input type="color" value={embed.color} onChange={(event) => updateEmbed(embed.id, { color: event.target.value })} /></label>
                    </div>
                    <label>Description<textarea value={embed.description} onChange={(event) => updateEmbed(embed.id, { description: event.target.value })} /></label>
                    <div className="formGrid two">
                      <label>URL<input value={embed.url} onChange={(event) => updateEmbed(embed.id, { url: event.target.value })} placeholder="Optional title URL" /></label>
                      <label>Footer<input value={embed.footer} onChange={(event) => updateEmbed(embed.id, { footer: event.target.value })} /></label>
                    </div>
                    <div className="formGrid two">
                      <label>Thumbnail<input value={embed.thumbnail} onChange={(event) => updateEmbed(embed.id, { thumbnail: event.target.value })} /></label>
                      <label>Image<input value={embed.image} onChange={(event) => updateEmbed(embed.id, { image: event.target.value })} /></label>
                    </div>
                    <div className="subHead">
                      <h3>Fields</h3>
                      <button onClick={() => updateEmbed(embed.id, { fields: [...embed.fields, { id: id(), name: "New Field", value: "Field value", inline: true }].slice(0, 25) })}>+ Field</button>
                    </div>
                    <div className="fieldList">
                      {embed.fields.map((field) => (
                        <div className="fieldBox five" key={field.id}>
                          <label className="check"><input type="checkbox" checked={field.inline} onChange={(event) => updateField(embed.id, field.id, { inline: event.target.checked })} /> Inline</label>
                          <input value={field.name} onChange={(event) => updateField(embed.id, field.id, { name: event.target.value })} placeholder="Name" />
                          <input value={field.value} onChange={(event) => updateField(embed.id, field.id, { value: event.target.value })} placeholder="Value" />
                          <button onClick={() => updateEmbed(embed.id, { fields: embed.fields.filter((item) => item.id !== field.id) })}>Remove</button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <SharedButtons buttons={buttons} setButtons={setButtons} setCustomPayload={setCustomPayload} />
              </div>
            )}

            {mode === "v2" && (
              <div className="panelStack">
                <div className="panel">
                  <div className="panelHead">
                    <div>
                      <h2>Components V2</h2>
                      <p>Container with Text Display, Separator, Section, Thumbnail, Media Gallery and Action Row. Buttons can be placed anywhere.</p>
                    </div>
                  </div>
                  <label>Accent color<input type="color" value={accent} onChange={(event) => { setCustomPayload(null); setAccent(event.target.value); }} /></label>
                </div>

                {v2Components.map((component, index) => (
                  <div
                    className="panel"
                    key={component.id}
                    draggable
                    onDragStart={(e) => {
                      dragIndexRef.current = index;
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverIndex(index);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = dragIndexRef.current;
                      if (from === null || from === index) return;
                      setCustomPayload(null);
                      setV2Components((current) => {
                        const next = [...current];
                        const [moved] = next.splice(from, 1);
                        next.splice(index, 0, moved);
                        return next;
                      });
                      dragIndexRef.current = null;
                      setDragOverIndex(null);
                    }}
                    onDragEnd={() => {
                      dragIndexRef.current = null;
                      setDragOverIndex(null);
                    }}
                    style={{
                      opacity: dragIndexRef.current === index ? 0.4 : 1,
                      outline: dragOverIndex === index && dragIndexRef.current !== index ? "2px solid #5865F2" : undefined,
                      transition: "outline 0.1s"
                    }}
                  >
                    <div className="panelHead">
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span
                          title="Drag to reorder"
                          style={{ cursor: "grab", fontSize: "1.1rem", opacity: 0.4, userSelect: "none", lineHeight: 1 }}
                          onMouseDown={(e) => e.stopPropagation()}
                        >⠿</span>
                        <div>
                          <h2>
                            {component.type === "text_display" ? "Text Display"
                              : component.type === "section" ? "Section"
                              : component.type === "action_row" ? "Action Row (Buttons)"
                              : "Separator"}
                          </h2>
                          <p>
                            {component.type === "text_display" ? "Markdown supported"
                              : component.type === "section" ? "Text with optional accessory"
                              : component.type === "action_row" ? `${component.buttons.length}/5 buttons`
                              : "Visual break"}
                          </p>
                        </div>
                      </div>
                      <div className="miniActions">
                        <button onClick={() => { setCustomPayload(null); setV2Components((current) => current.filter((item) => item.id !== component.id)); }}>Remove</button>
                      </div>
                    </div>
                    {component.type === "text_display" && (
                      <label>Content<textarea value={component.content} onChange={(event) => {
                        setCustomPayload(null);
                        setV2Components((current) => current.map((item) => item.id === component.id ? { ...item, content: event.target.value } : item));
                      }} /></label>
                    )}
                    {component.type === "section" && (
                      <>
                        <label>Content<textarea value={component.content} onChange={(event) => {
                          setCustomPayload(null);
                          setV2Components((current) => current.map((item) => item.id === component.id ? { ...item, content: event.target.value } : item));
                        }} /></label>
                        <label>Accessory
                          <select value={component.accessoryType} onChange={(e) => {
                            setCustomPayload(null);
                            setV2Components((current) => current.map((item) => item.id === component.id ? { ...item, accessoryType: e.target.value as SectionAccessoryType } : item));
                          }}>
                            <option value="none">None</option>
                            <option value="thumbnail">Thumbnail (image)</option>
                            <option value="button">Button</option>
                          </select>
                        </label>
                        {component.accessoryType === "thumbnail" && (
                          <label>Thumbnail URL<input value={component.thumbnail} onChange={(event) => {
                            setCustomPayload(null);
                            setV2Components((current) => current.map((item) => item.id === component.id ? { ...item, thumbnail: event.target.value } : item));
                          }} placeholder="https://..." /></label>
                        )}
                        {component.accessoryType === "button" && (
                          <div className="fieldBox four">
                            <input value={component.buttonEmoji} onChange={(e) => { setCustomPayload(null); setV2Components((c) => c.map((item) => item.id === component.id ? { ...item, buttonEmoji: e.target.value } : item)); }} placeholder="Emoji" />
                            <input value={component.buttonLabel} onChange={(e) => { setCustomPayload(null); setV2Components((c) => c.map((item) => item.id === component.id ? { ...item, buttonLabel: e.target.value } : item)); }} placeholder="Label" />
                            <select value={component.buttonButtonType} onChange={(e) => { setCustomPayload(null); setV2Components((c) => c.map((item) => item.id === component.id ? { ...item, buttonButtonType: e.target.value as DiscordButton["buttonType"], buttonUrl: "", buttonCustomId: "" } : item)); }}>
                              <option value="link">Link</option>
                              <option value="primary">Primary</option>
                              <option value="secondary">Secondary</option>
                              <option value="success">Success</option>
                              <option value="danger">Danger</option>
                            </select>
                            {component.buttonButtonType === "link" ? (
                              <input value={component.buttonUrl} onChange={(e) => { setCustomPayload(null); setV2Components((c) => c.map((item) => item.id === component.id ? { ...item, buttonUrl: e.target.value } : item)); }} placeholder="URL" />
                            ) : (
                              <input value={component.buttonCustomId} onChange={(e) => { setCustomPayload(null); setV2Components((c) => c.map((item) => item.id === component.id ? { ...item, buttonCustomId: e.target.value } : item)); }} placeholder="Custom ID" />
                            )}
                          </div>
                        )}
                      </>
                    )}
                    {component.type === "separator" && (
                      <div className="formGrid two">
                        <label className="toggle"><input type="checkbox" checked={component.divider} onChange={(event) => {
                          setCustomPayload(null);
                          setV2Components((current) => current.map((item) => item.id === component.id ? { ...item, divider: event.target.checked } : item));
                        }} /> Divider</label>
                        <label>Spacing<input type="number" value={component.spacing} onChange={(event) => {
                          setCustomPayload(null);
                          setV2Components((current) => current.map((item) => item.id === component.id ? { ...item, spacing: Number(event.target.value) } : item));
                        }} /></label>
                      </div>
                    )}
                    {component.type === "action_row" && (
                      <V2ActionRowEditor
                        buttons={component.buttons}
                        onChange={(newButtons) => {
                          setCustomPayload(null);
                          setV2Components((current) =>
                            current.map((item) => item.id === component.id ? { ...item, buttons: newButtons } : item)
                          );
                        }}
                      />
                    )}
                  </div>
                ))}

                <div className="panel">
                  <div className="miniActions">
                    <button onClick={() => { setCustomPayload(null); setV2Components((current) => [...current, { id: id(), type: "text_display", content: "New Text Display" }]); }}>+ Add Text Display</button>
                    <button onClick={() => { setCustomPayload(null); setV2Components((current) => [...current, { id: id(), type: "section", content: "New Section", accessoryType: "none" as SectionAccessoryType, thumbnail: "", buttonLabel: "", buttonEmoji: "🔗", buttonButtonType: "link" as DiscordButton["buttonType"], buttonUrl: "https://discord.com", buttonCustomId: "" }]); }}>+ Add Section</button>
                    <button onClick={() => { setCustomPayload(null); setV2Components((current) => [...current, { id: id(), type: "separator", divider: true, spacing: 1 }]); }}>+ Add Separator</button>
                    <button onClick={() => { setCustomPayload(null); setV2Components((current) => [...current, { id: id(), type: "action_row", buttons: [{ id: id(), label: "Button", emoji: "✨", buttonType: "link", url: "https://discord.com" }] }]); }}>+ Add Action Row</button>
                  </div>
                </div>

                <div className="panel">
                  <div className="panelHead">
                    <div>
                      <h2>Media Gallery</h2>
                      <p>Uses the Components V2 media gallery component.</p>
                    </div>
                    <label className="toggle"><input type="checkbox" checked={includeGallery} onChange={(event) => { setCustomPayload(null); setIncludeGallery(event.target.checked); }} /> Enabled</label>
                  </div>
                  <div className="fieldList">
                    {gallery.map((item) => (
                      <div className="fieldBox row" key={item.id}>
                        <input value={item.url} onChange={(event) => { setCustomPayload(null); setGallery((current) => current.map((g) => g.id === item.id ? { ...g, url: event.target.value } : g)); }} placeholder="Image or media URL" />
                        <button onClick={() => setGallery((current) => current.filter((g) => g.id !== item.id))}>Remove</button>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setGallery((current) => [...current, { id: id(), url: "" }].slice(0, 10))}>+ Add media</button>
                </div>
              </div>
            )}

            {mode === "json" && (
              <div className="panelStack">
                <div className="panel">
                  <div className="panelHead">
                    <div>
                      <h2>JSON editor</h2>
                      <p>Delete the current JSON and paste a full Discord payload directly.</p>
                    </div>
                    <div className="miniActions">
                      <button onClick={clearJson}>Clear</button>
                      <button onClick={applyJson}>Apply JSON</button>
                      <button onClick={useBuilderAgain}>Builder</button>
                    </div>
                  </div>
                  <textarea className="jsonArea" value={rawJson} onChange={(event) => setRawJson(event.target.value)} placeholder="Paste your Discord JSON payload here..." spellCheck={false} />
                </div>
              </div>
            )}
          </section>

          <section className="preview">
            <div className="previewTop">
              <div>
                <h2>Live preview</h2>
                <p>Discord-style preview for Embed V1 and Components V2.</p>
              </div>
            </div>
            <div className="discordMessage">
              <div className="avatar imageAvatar"><img src="/betterembeds-logo.png" alt="BetterEmbeds logo" /></div>
              <div className="messageBody">
                <div className="messageMeta"><b>{BOT_NAME}</b><span>APP</span><small>Today at 12:34</small></div>
                <PayloadPreview payload={payload} />
              </div>
            </div>
            <div className="jsonPanel"><pre>{prettyJson}</pre></div>
          </section>
        </div>
      </section>
    </main>
  );
}

function SharedButtons({ buttons, setButtons, setCustomPayload }: { buttons: DiscordButton[]; setButtons: React.Dispatch<React.SetStateAction<DiscordButton[]>>; setCustomPayload: React.Dispatch<React.SetStateAction<JsonPayload | null>> }) {
  function updateButton(buttonId: string, values: Partial<DiscordButton>) {
    setCustomPayload(null);
    setButtons((current) => current.map((button) => (button.id === buttonId ? { ...button, ...values } : button)));
  }

  return (
    <div className="panel">
      <div className="panelHead">
        <div>
          <h2>Buttons</h2>
          <p>Webhook-safe link buttons. Custom ID buttons and select menus need a Discord app interaction endpoint.</p>
        </div>
        <button onClick={() => setButtons((current) => [...current, { id: id(), label: "New Button", emoji: "✨", buttonType: "link" as "link", url: "https://discord.com" }].slice(0, 5))}>+ Button</button>
      </div>
      <div className="fieldList">
        {buttons.map((button) => (
          <div className="fieldBox four" key={button.id}>
            <input value={button.emoji} onChange={(event) => updateButton(button.id, { emoji: event.target.value })} placeholder="Emoji" />
            <input value={button.label} onChange={(event) => updateButton(button.id, { label: event.target.value })} placeholder="Label" />
            <select value={button.buttonType} onChange={(event) => updateButton(button.id, { buttonType: event.target.value as DiscordButton["buttonType"], url: undefined, customId: undefined })}>
              <option value="link">Link</option>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="success">Success</option>
              <option value="danger">Danger</option>
            </select>
            {button.buttonType === "link" ? (
              <input value={button.url} onChange={(event) => updateButton(button.id, { url: event.target.value })} placeholder="URL" />
            ) : (
              <input value={button.customId} onChange={(event) => updateButton(button.id, { customId: event.target.value })} placeholder="Custom ID" />
            )}
            <button onClick={() => setButtons((current) => current.filter((b) => b.id !== button.id))}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function V2ActionRowEditor({ buttons, onChange }: { buttons: DiscordButton[]; onChange: (buttons: DiscordButton[]) => void }) {
  function updateButton(buttonId: string, values: Partial<DiscordButton>) {
    onChange(buttons.map((b) => (b.id === buttonId ? { ...b, ...values } : b)));
  }

  return (
    <div>
      <div className="fieldList">
        {buttons.map((button) => (
          <div className="fieldBox four" key={button.id}>
            <input value={button.emoji} onChange={(e) => updateButton(button.id, { emoji: e.target.value })} placeholder="Emoji" />
            <input value={button.label} onChange={(e) => updateButton(button.id, { label: e.target.value })} placeholder="Label" />
            <select value={button.buttonType} onChange={(e) => updateButton(button.id, { buttonType: e.target.value as DiscordButton["buttonType"], url: undefined, customId: undefined })}>
              <option value="link">Link</option>
              <option value="primary">Primary</option>
              <option value="secondary">Secondary</option>
              <option value="success">Success</option>
              <option value="danger">Danger</option>
            </select>
            {button.buttonType === "link" ? (
              <input value={button.url ?? ""} onChange={(e) => updateButton(button.id, { url: e.target.value })} placeholder="URL" />
            ) : (
              <input value={button.customId ?? ""} onChange={(e) => updateButton(button.id, { customId: e.target.value })} placeholder="Custom ID" />
            )}
            <button onClick={() => onChange(buttons.filter((b) => b.id !== button.id))}>Remove</button>
          </div>
        ))}
      </div>
      {buttons.length < 5 && (
        <button onClick={() => onChange([...buttons, { id: id(), label: "New Button", emoji: "✨", buttonType: "link", url: "https://discord.com" }])}>+ Add Button</button>
      )}
    </div>
  );
}

function PayloadPreview({ payload }: { payload: JsonPayload }) {
  if (typeof payload.content === "string" && payload.content.trim()) {
    return <><p className="messageContent">{payload.content}</p><PayloadBody payload={payload} /></>;
  }
  return <PayloadBody payload={payload} />;
}

function PayloadBody({ payload }: { payload: JsonPayload }) {
  if (isV2Payload(payload)) {
    const components = Array.isArray(payload.components) ? payload.components as Record<string, unknown>[] : [];
    if (!components.length) return <p className="messageContent">No components in this payload.</p>;
    return <div className="v2Preview">{components.map((component, index) => <RenderComponent component={component} key={index} />)}</div>;
  }

  const embeds = Array.isArray(payload.embeds) ? payload.embeds as Record<string, unknown>[] : [];
  const components = Array.isArray(payload.components) ? payload.components as Record<string, unknown>[] : [];

  if (!embeds.length && !components.length) return <p className="messageContent">No embeds or components in this payload.</p>;

  return (
    <>
      {embeds.slice(0, 10).map((embed, index) => <RenderEmbed embed={embed} key={index} />)}
      {components.map((component, index) => <RenderComponent component={component} key={index} />)}
    </>
  );
}

function RenderEmbed({ embed }: { embed: Record<string, unknown> }) {
  const author = embed.author && typeof embed.author === "object" ? embed.author as Record<string, unknown> : null;
  const footer = embed.footer && typeof embed.footer === "object" ? embed.footer as Record<string, unknown> : null;
  const thumbnail = embed.thumbnail && typeof embed.thumbnail === "object" ? embed.thumbnail as Record<string, unknown> : null;
  const image = embed.image && typeof embed.image === "object" ? embed.image as Record<string, unknown> : null;
  const fields = Array.isArray(embed.fields) ? embed.fields as Record<string, unknown>[] : [];
  const color = numberToHex(embed.color);

  return (
    <div className="embedPreview" style={{ borderLeftColor: color }}>
      <div>
        <small>{String(author?.name || BOT_NAME)}</small>
        {typeof embed.title === "string" && <h3>{embed.title}</h3>}
        {typeof embed.description === "string" && <p>{embed.description}</p>}
        {fields.length > 0 && (
          <div className="previewFields">
            {fields.map((field, index) => (
              <div className={field.inline === false ? "full" : ""} key={index}>
                <b>{String(field.name || "Field")}</b>
                <span>{String(field.value || "Value")}</span>
              </div>
            ))}
          </div>
        )}
        {typeof image?.url === "string" && image.url && <img className="embedImage" src={image.url} alt="Embed image" />}
        {typeof footer?.text === "string" && <footer>{footer.text}</footer>}
      </div>
      {typeof thumbnail?.url === "string" && thumbnail.url ? <img className="thumb" src={thumbnail.url} alt="Thumbnail" /> : null}
    </div>
  );
}

function RenderComponent({ component }: { component: Record<string, unknown> }) {
  const type = Number(component.type);

  if (type === 17) {
    const accent = typeof component.accent_color === "number" ? numberToHex(component.accent_color) : "#5865F2";
    const children = Array.isArray(component.components) ? component.components as Record<string, unknown>[] : [];
    return <div className="v2Container" style={{ borderLeftColor: accent }}>{children.map((child, index) => <RenderComponent component={child} key={index} />)}</div>;
  }

  if (type === 10) {
    const text = textFromComponent(component);
    const title = text.match(/^##\s+(.+)/)?.[1];
    if (title) return <h3>{title}</h3>;
    return <p className="textDisplay">{stripHeading(text)}</p>;
  }

  if (type === 14) return <div className={component.divider === false ? "v2Spacer" : "v2Separator"} />;

  if (type === 9) {
    const children = Array.isArray(component.components) ? component.components as Record<string, unknown>[] : [];
    const accessory = component.accessory && typeof component.accessory === "object" ? component.accessory as Record<string, unknown> : null;
    return (
      <div className="v2Section">
        <div>{children.map((child, index) => <RenderComponent component={child} key={index} />)}</div>
        {accessory && <RenderAccessory accessory={accessory} />}
      </div>
    );
  }

  if (type === 12) {
    const items = Array.isArray(component.items) ? component.items as Record<string, unknown>[] : [];
    return (
      <div className="galleryGrid">
        {items.slice(0, 10).map((item, index) => {
          const media = item.media && typeof item.media === "object" ? item.media as Record<string, unknown> : {};
          const url = typeof media.url === "string" ? media.url : "";
          return url ? <img src={url} alt="Media preview" key={index} /> : <div className="galleryEmpty" key={index}>Media</div>;
        })}
      </div>
    );
  }

  if (type === 13) {
    const file = component.file && typeof component.file === "object" ? component.file as Record<string, unknown> : {};
    const name = typeof file.url === "string" ? file.url.split("/").pop() : "Attached file";
    return <div className="fileBox">📎 {name}</div>;
  }

  if (type === 1) {
    const children = Array.isArray(component.components) ? component.components as Record<string, unknown>[] : [];
    return <div className="buttonRow">{children.map((child, index) => <RenderComponent component={child} key={index} />)}</div>;
  }

  if (type === 2) {
    const label = typeof component.label === "string" ? component.label : "Button";
    const e = component.emoji && typeof component.emoji === "object" ? (component.emoji as Record<string, unknown>).name : "";
    const style = Number(component.style);
    const url = typeof component.url === "string" ? component.url : "";
    const customId = typeof component.custom_id === "string" ? component.custom_id : "";

    const buttonClass = `discordButton style-${style}`;

    if (style === 5) { // Link button
      return <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClass}>{String(e || "")} {label}</a>;
    } else { // Interactive button
      return <button className={buttonClass}>{String(e || "")} {label}</button>;
    }
  }

  if ([3, 5, 6, 7, 8].includes(type)) {
    const placeholder = typeof component.placeholder === "string" ? component.placeholder : "Select an option";
    return <div className="selectBox">{placeholder}</div>;
  }

  return <div className="unknownBox">Component type {type || "unknown"}</div>;
}

function RenderAccessory({ accessory }: { accessory: Record<string, unknown> }) {
  const type = Number(accessory.type);
  if (type === 11) {
    const media = accessory.media && typeof accessory.media === "object" ? accessory.media as Record<string, unknown> : {};
    const url = typeof media.url === "string" ? media.url : "";
    return url ? <img className="thumbImage" src={url} alt="Thumbnail" /> : <div className="thumbImage">IMG</div>;
  }
  if (type === 2) return <RenderComponent component={accessory} />;
  return null;
}
