"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChatWindow } from "@/components/ChatWindow";
import { useI18n } from "@/hooks/useI18n";
import type { PackChat } from "@/lib/studio/chat";
import { errorMessage, packPath, studioFetch } from "@/lib/studio/client";
import type { SessionInfo } from "@/lib/types";
import { ConfirmDialog, formatStudioDate, Notice } from "./StudioUi";

// « Discuter » (STUDIO-NOTES §19.3): the pack's conversations on the left,
// pi-web's own chat on the right. The Studio starts each conversation (the
// pack's folder, test tools and default model); pi-web's chat does the rest:
// streaming, tool cards, extension dialogs, model choice.

const LIST_REFRESH_MS = 5000;

function chatTitle(chat: PackChat, fallback: string): string {
  return chat.firstMessage.trim().split("\n")[0]?.slice(0, 80) || fallback;
}

export function ChatSection({ packId, item, onSelect }: {
  packId: string;
  item: string | null;
  onSelect: (chatId: string | null) => void;
}) {
  const { t, locale } = useI18n();
  const [chats, setChats] = useState<PackChat[] | null>(null);
  const [packDir, setPackDir] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState<PackChat | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // The conversation just started: shown before the list knows it.
  const [fresh, setFresh] = useState<PackChat | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await studioFetch<{ chats: PackChat[]; dir: string }>(packPath(packId, "/chats"));
      setChats(data.chats);
      setPackDir(data.dir);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, t));
    }
  }, [packId, t]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const { chat } = await studioFetch<{ chat: PackChat & { cwd: string } }>(packPath(packId, "/chats"), { method: "POST", body: {} });
      setPackDir(chat.cwd);
      setFresh(chat);
      onSelect(chat.id);
      void load();
    } catch (cause) {
      setError(errorMessage(cause, t));
    } finally {
      setStarting(false);
    }
  };

  const remove = async (chat: PackChat) => {
    setDeleteBusy(true);
    try {
      await studioFetch(packPath(packId, `/chats/${encodeURIComponent(chat.id)}`), { method: "DELETE" });
      setDeleting(null);
      if (item === chat.id) onSelect(null);
      if (fresh?.id === chat.id) setFresh(null);
      await load();
    } catch (cause) {
      setError(errorMessage(cause, t));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const listed = useMemo(() => {
    const list = chats ?? [];
    return fresh && !list.some((chat) => chat.id === fresh.id) ? [fresh, ...list] : list;
  }, [chats, fresh]);
  const selected = listed.find((chat) => chat.id === item) ?? null;

  // What pi-web's chat needs to open an existing session.
  const session: SessionInfo | null = useMemo(() => selected && packDir ? {
    id: selected.id,
    path: "",
    cwd: packDir,
    name: `[chat] ${selected.name}`,
    created: selected.created,
    modified: selected.modified,
    messageCount: selected.messageCount,
    firstMessage: selected.firstMessage,
    transient: selected.transient,
  } : null, [selected, packDir]);

  const piWebHref = selected ? `/?pi-web&session=${encodeURIComponent(selected.id)}` : null;

  return (
    <div className="studio-section studio-chat-section">
      <header className="studio-section-header is-row">
        <div>
          <h2 className="studio-title">{t("studio.nav.chat")}</h2>
          <p className="studio-muted">{t("studio.chat.intro")}</p>
        </div>
        <div className="studio-list-actions">
          {piWebHref && (
            // A plain link: a page load is what tells the Studio pi-web was chosen (lib/studio/home.ts).
            <a className="studio-button" href={piWebHref} target="_blank" rel="noreferrer">{t("studio.chat.openInPiWeb")}</a>
          )}
          <button type="button" className="studio-button is-primary" disabled={starting} onClick={() => void start()}>
            {starting ? t("studio.chat.starting") : t("studio.chat.new")}
          </button>
        </div>
      </header>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="studio-chat-layout">
        <aside className="studio-chat-list" aria-label={t("studio.chat.list")}>
          {chats === null && !fresh && <p className="studio-muted">{t("studio.common.loading")}</p>}
          {chats !== null && listed.length === 0 && <p className="studio-muted">{t("studio.chat.none")}</p>}
          <ul className="studio-plain-list">
            {listed.map((chat) => (
              <li key={chat.id} className={`studio-chat-row${chat.id === item ? " is-selected" : ""}`}>
                <button type="button" className="studio-chat-open" aria-current={chat.id === item ? "true" : undefined} onClick={() => onSelect(chat.id)}>
                  <span className="studio-chat-title">{chatTitle(chat, t("studio.chat.untitled"))}</span>
                  <span className="studio-hint">{formatStudioDate(chat.modified, locale)}</span>
                </button>
                <button type="button" className="studio-icon-button" title={t("studio.chat.delete")} aria-label={t("studio.chat.delete")} onClick={() => setDeleting(chat)}>×</button>
              </li>
            ))}
          </ul>
        </aside>
        <div className="studio-chat-pane">
          {session ? (
            <div className="studio-chat-window">
              <ChatWindow key={session.id} session={session} newSessionCwd={null} newSessionDraftKey={null} />
            </div>
          ) : (
            <div className="studio-empty">
              <p>{t("studio.chat.empty")}</p>
              <button type="button" className="studio-button is-primary" disabled={starting} onClick={() => void start()}>{t("studio.chat.new")}</button>
            </div>
          )}
        </div>
      </div>
      {deleting && (
        <ConfirmDialog
          title={t("studio.chat.deleteTitle")}
          message={t("studio.chat.deleteMessage", { name: chatTitle(deleting, t("studio.chat.untitled")) })}
          confirmLabel={t("studio.chat.delete")}
          danger
          busy={deleteBusy}
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
