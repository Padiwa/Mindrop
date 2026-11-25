# Mindrop guide

Mindrop is a second brain that lives in your browser. It keeps the pages, links, notes, quotes, images and videos that matter to you, lets you connect them with #tags and `[[title]]` links, and lets you browse them as a mosaic or a mind map.

Everything is stored **locally** in your browser: no account, no server, nothing is sent over the Internet.

## Install

Mindrop runs in Chromium-based browsers: Chrome, Brave, Edge, Chromium, Vivaldi. It is not on the Chrome Web Store (yet), so you install it from its folder.

1. Download **[mindrop.zip](https://github.com/Padiwa/Mindrop/releases/latest/download/mindrop.zip)**, the latest version (all versions are on the [Releases](https://github.com/Padiwa/Mindrop/releases) page), and unzip it. Keep the `mindrop` folder somewhere it will stay: the browser reads it every time it starts.
2. Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the `mindrop` folder (the one that contains `manifest.json`).
5. Pin the orange icon to the toolbar (puzzle icon, then the pin).

To update: replace the folder's content with the new zip's, then click Mindrop's reload button on the extensions page. Your memories stay.

You can also `git clone` the repository and load its folder: you then update with `git pull`.

## Save

| How | What it does |
|---|---|
| Click the icon, or `Alt+Shift+S` | A window with the page preview, its title, a personal note and #tags. The **Note** tab is for a quick thought. |
| `Alt+Shift+D` | Saves the current page at once, without a window (a ✓ shows on the icon). |
| Right-click selected text | "Save the selection as a quote". |
| Right-click a link or an image | "Save this link", "Save this image". |
| Select text, then click the icon | Offers to keep the selection as a quote. |

When it saves a page, Mindrop also keeps its **main text** (the article, without the menus), so you can find it again by searching. For a YouTube video, it fetches the real title, channel and thumbnail.

## The Mindrop page

Open it with `Alt+Shift+M`, the "Open Mindrop" link in the window, or a right-click on the icon.

- **A mosaic** of all your memories: page captures, coloured notes, quotes, images, videos.
- **An index** in the left margin: filters by type (links, notes, quotes, images, videos, pinned) and by tag, with how many memories each has.
- **Instant search** (`/` key). It ignores accents and case, and it is tolerant: a word also finds its plurals and variants ("methods" finds "méthodes", "typography" finds "typographie") and words one or two letters off. It also covers the saved page text. `#design` filters by tag.
- **A detail sheet** on click: title, note, tags, colour, pin, delete, and the page text kept when it was saved.
- **Write an idea directly** in the top area (`Ctrl+Enter` to keep it); pasting an address saves it as a link.
- **Drag and drop** or **paste** (`Ctrl+V`) an image, a link or some text onto the page.
- **Rediscover** brings back a random memory.
- **Export and Import**: a JSON backup, also handy to move from one browser to another.

## Markdown notes

Notes are written in Markdown: `# title`, `**bold**`, `*italic*`, `~~strikethrough~~`, `` `code` ``, lists (`-`, `1.`), checkboxes (`- [ ] task`), quotes (`>`), code blocks and `[text](https://…)` links.

- Checkboxes can be ticked right on the mosaic card.
- A note's sheet has two tabs: **Write** and **Preview**. `Ctrl+E` switches between them; double-click the preview to write.
- Personal notes on links and images are shown as Markdown too.

## Connect: tags and links

- **Tags**: while you type in a tag field (popup, writing area, sheet), the tags you already use are suggested, most frequent first. Arrow keys to choose, Enter or Tab to accept, Escape to close.
- **Links between memories**: write `[[Title]]`, or `[[Title|label]]`, in a note or a personal note to cite another memory. A note's title is its first line; accents and capitals do not matter.
  - Typing `[[` suggests existing titles.
  - A link opens with a click. A link to a title that does not exist yet is dashed: a click creates the note.
  - The sheet lists **Links to** and **Cited by**.

## Mind map

The **Mind map** button shows your memories around their tags.

- Each #tag is a bubble connected to "Mindrop"; dotted lines connect tags that share memories.
- As you zoom (wheel, trackpad, + and − buttons), memories appear around their first tag, with a thread to each of their other tags.
- `[[title]]` links between memories are drawn in orange.
- Click a tag to zoom on it; drag a tag to move it (its position is remembered). **Rearrange** lays the map out again, **Show all** or the 0 key fits everything.
- Hovering a tag or a card highlights its links.

## Language

Mindrop speaks English and French. By default it follows your browser: French if the browser is in French, English otherwise. To choose, open the Mindrop page, then **Settings** in the left column, **Language**: Automatic, Français or English. The choice applies to the whole extension (page, popup, context menu); your own notes are never translated.

The extension's name and description on the browser's extensions page always follow the browser's language: Chrome does not let an extension change them.

## Local bridge: AI agent and backups

The `mcp/` folder installs a bridge between the extension and your computer, without going through the Internet. It brings:

- **automatic backups** of all your memories, images included, on your disk, with restore from the Mindrop page;
- an **MCP server**, so an AI agent (Claude Code, pi or any MCP client) can search Mindrop, read-only, with a switch to cut access.

Setup and use: see the **[Local bridge](local-bridge.md)** guide.

## Good to know

- If a shortcut does not work, the browser probably already uses it: pick another one in `chrome://extensions/shortcuts`.
- The browser's internal pages (`chrome://`, the Web Store) cannot be captured: the Note tab still works.
- Uninstalling the extension deletes its data: export first, or install the local bridge for automatic backups on your disk.
- For local files (`file://`), turn on "Allow access to file URLs" in the extension's details.
- The fonts ship in `fonts/`: nothing is loaded from the Internet.

## Development

The extension has no dependencies and no build step: the repository folder loads as it is. The code is JavaScript, type-checked by TypeScript through JSDoc comments; the shared types are in `types.d.ts`. TypeScript is only a development tool, never shipped in the extension.

Development needs Node 22 or later, and a Chromium browser for the browser tests (set `CHROME_PATH` if it is not found on its own):

```sh
npm install            # TypeScript and the Chrome and Node types, for the type check
npm test               # everything: types, Node tests, browser tests
npm run typecheck      # types only
npm run test:node      # search, links, local bridge, MCP server, the zip
npm run test:browser   # IndexedDB storage, Markdown rendering, backups, suggestions
npm run pack           # builds dist/mindrop.zip, the extension to hand out
npm run site           # rebuilds the documentation site (docs/ folder)
```

**Releasing a version:** raise `version` in `manifest.json` and `package.json`, commit, then push a matching tag: `git tag v1.8.0 && git push origin v1.8.0`. A GitHub Action runs the tests, builds the zip and publishes the release; the site's download button always points to the latest one.

## License

Mindrop is free software, released under the **GNU Affero General Public License, version 3 or any later version** (AGPL-3.0-or-later): see the [LICENSE](../../LICENSE) file.
You may use, study, change and share it; any modified version you distribute, or offer to others over a network, must stay under the same license, with its source code.

The fonts in `fonts/` keep their own license, the SIL Open Font License 1.1: Hanken Grotesk ([OFL-HankenGrotesk.txt](../../fonts/OFL-HankenGrotesk.txt)), Newsreader ([OFL-Newsreader.txt](../../fonts/OFL-Newsreader.txt)) and IBM Plex Mono ([OFL-IBMPlexMono.txt](../../fonts/OFL-IBMPlexMono.txt)).
