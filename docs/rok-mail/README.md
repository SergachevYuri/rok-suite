# RoK Mail

A WYSIWYG composer for the rich-text markup used in in-game Rise of Kingdoms mails. Drop in text, format it with a toolbar, preview the result, and copy the markup back into the game.

**Live:** [/rok-mail](https://rok-suite-web.vercel.app/rok-mail)

## Features

- **Three editor modes** — edit only, split (edit + live preview), or preview only
- **Toolbar formatting** — bold, italic, underline, strikethrough, size, color, gradient, alignment
- **Color picker** — palette of common RoK mail colors plus hex entry
- **Gradient picker** — generates per-character color markup for rainbow/gradient text
- **Symbol picker** — Unicode symbols commonly used in RoK mails
- **Templates** — starter layouts for alliance announcements, recruitment, event recaps, and more
- **AI Assistant** — Gemini-backed drafting and polishing with configurable tone and length
- **Auto-split** — long mails are split into parts that fit the in-game character cap; manual `---` breaks are respected
- **Character counter** — shows total, per-part, and remaining characters before the cap
- **Shareable drafts** — save to Supabase and share a short URL (`?share=xxxxxxxx`) with teammates

## Typical flow

1. Pick a template (or start blank)
2. Type your mail in the edit pane; use the toolbar for formatting
3. Optionally open the **AI Assistant** to rewrite or expand sections
4. Check the preview pane (and character counter) for how it'll look in-game
5. If the mail is long, add manual `---` breaks or let auto-split handle it
6. Click **Copy** to copy the RoK markup, then paste into the in-game mail composer

## Sharing

Click **Share Link** to persist the current draft to Supabase and get a short URL. Anyone with the link sees the same draft; edits after sharing don't automatically sync — re-share to update.

## AI Assistant

Requires `GEMINI_API_KEY` in the server environment. The API route (`/api/rok-mail/ai`) proxies requests to Google Gemini so the key is never exposed to the client.
