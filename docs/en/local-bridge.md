# Local bridge: AI agent (MCP) and automatic backups

The local bridge connects the extension to your computer. Once installed (only once, see "Setup"), it brings two things:

- **an MCP server**: an AI agent (Claude Code or any MCP client) can **search Mindrop**, **read-only**;
- **automatic backups**: a full copy, images included, written to your disk after each change.

Nothing goes over the Internet.

## How it works

A program outside the browser cannot read an extension's data. So a bridge connects them:

```
Extension  ──(native messaging)──▶  mcp/host.mjs  ──writes──▶  brain.json  ◀──reads──  mcp/server.mjs  ◀──MCP──  Agent
```

1. On every addition, change or deletion, the extension sends a copy of your memories to `mcp/host.mjs`.
   It uses "native messaging", Chrome's official way to talk to a local program: **nothing goes over the network**.
2. `host.mjs` writes that copy to a file only you can read:
   - Linux: `~/.local/share/second-cerveau/brain.json`
   - macOS: `~/Library/Application Support/second-cerveau/brain.json`
3. When the agent calls a tool, `mcp/server.mjs` reads that file, and reads it again whenever it has changed.

Images stored inside the extension (captures, dropped images) are not copied for the agent, only links to web images.

## Requirements

- **Node.js 18 or later** (`node --version`).
- A Chromium browser: Chrome, Chromium, Brave, Edge or Vivaldi.
- **Linux or macOS.** On Windows, the native host is registered in the registry, which the setup script does not do.
- The Mindrop extension loaded in the browser (see the [guide](guide.md)).

## Setup

### 1. Get the extension id

Open `chrome://extensions` (or `brave://extensions`, `edge://extensions`) and turn on **Developer mode**.
The id is the 32-letter string under the extension's name, for example `abcdefghijklmnopabcdefghijklmnop`.

An unpacked extension's id depends on its folder: if you move the folder, the id changes. You then need to run this setup again, and your data does not follow: export it first.

### 2. Register the bridge

From the project folder:

```sh
node mcp/install.mjs <extension-id>
```

The script:
- creates a small `host.sh` launcher next to the data file, with the full path to your Node (the browser starts programs with a minimal `PATH`);
- registers the bridge for every browser it finds, in its `NativeMessagingHosts` folder, allowing only your extension;
- prints the exact command for step 4.

### 3. Reload the extension

On the extensions page, click Mindrop's reload button. Accept the new "communicate with cooperating native applications" permission if the browser asks.

The first copy is sent at once. Check that it arrived:

```sh
ls -l ~/.local/share/second-cerveau/brain.json
```

### 4. Connect your agent

**Claude Code:**

```sh
claude mcp add mindrop -- node /path/to/the-extension/mcp/server.mjs
```

Add `--scope user` to make it available in all your projects, not only the current folder. Check with `claude mcp list`, or `/mcp` in a session.

**Another MCP client** (Claude Desktop, Cursor, pi…): declare a stdio server in its configuration:

```json
{
  "mcpServers": {
    "mindrop": {
      "command": "node",
      "args": ["/path/to/the-extension/mcp/server.mjs"]
    }
  }
}
```

If the client cannot find `node`, put its full path in `command` (as given by `which node`).

## Use

Just ask the agent, for example:

- "Search Mindrop for what I saved about typography."
- "What are my main tags, and how do they relate?"
- "Find the Luhmann quote and show me the related memories."
- "Summarise the links I saved this month with the #design tag."

### Tools

| Tool | What it does | Parameters |
|---|---|---|
| `search_memories` | Searches titles, texts, notes, tags, descriptions, URLs and page text. Accent- and case-insensitive, tolerant of plurals, variants and typos (the same search as in the extension). | `query` (`#tag` filters by tag; empty = most recent), `type` (`link`, `note`, `quote`, `image`, `video`), `tags`, `pinned`, `since`, `until` (ISO dates), `limit`, `offset` |
| `get_memory` | The full memory: Markdown text, personal note, description, tags, dates, the page text kept when it was saved (in 30,000-character parts), and its `[[title]]` links both ways. | `id`, `contentOffset` |
| `list_tags` | Every tag with its number of memories, and for each the tags it most often appears with. | none |
| `related_memories` | Memories connected to a given one: first by a `[[title]]` link (either way), then by shared tags. | `id`, `limit` |

About search:
- Every word must match. If no memory contains them all, the search returns those that contain at least one and says so (`"mode": "any"`).
- It tolerates plurals, variants ("typography" finds "typographie") and typos, but knows no synonyms: the agent can rephrase.
- Every answer gives `syncedAt`, the time of the last copy received from the extension.

## Turn agent access on or off

On the Mindrop page, in the left column's settings, the **Agent access** switch controls what the MCP server can read. It is on by default.

- **On:** the copy read by the MCP server is kept up to date after each change. It holds all your memories except images stored inside the extension; links to web images stay.
- **Off:** the copy is **deleted** at once and replaced by a simple marker. An agent that queries the server gets "agent access is disabled", and no memory.
- **On again:** an up-to-date copy is written immediately.

A line under the switch shows the real state: how many memories are shared, when the last copy was made, or that the bridge is not installed.
The switch does not affect **automatic backups**, which go on either way.

## Automatic backups

Once the bridge is installed, the extension writes a **full copy** of your memories, images included, **one minute after the last change**:

- Linux: `~/.local/share/second-cerveau/backups/YYYY-MM-DD.json`
- macOS: `~/Library/Application Support/second-cerveau/backups/YYYY-MM-DD.json`

One file per day, rewritten by each backup of the day; **the 30 most recent files** are kept. Safeguards:

- if a backup holds **fewer memories** than the day's file (deletions, a reinstalled extension), the previous one is not overwritten: it is kept as `YYYY-MM-DD-HHMMSS.json` and shows in the list as "HH:MM version";
- an empty database is never backed up;
- an interrupted backup (browser closed mid-way) never replaces the previous one.

When the browser starts, a backup is made again if the last one is more than a day old.

On the Mindrop page, the **Backup** block in the left column's settings shows the last backup and lets you:

- **Back up now**;
- **Restore**: pick a date, then click a second time to confirm. Restoring adds missing memories and updates those that are older than in the backup; **it never deletes anything**.

Backup files use the same format as the export: the **Import** button accepts them too, for example to move to another computer.

## Update, troubleshooting and removal

**When to run `node mcp/install.mjs <id>` again:** if you move the project folder, if the extension id changes or if you change Node versions.

**The agent says no copy was found:**
1. Check that `brain.json` exists (command in step 3).
2. Reload the extension to force a copy.
3. Check that the bridge file exists for your browser, for example for Chrome:
   `~/.config/google-chrome/NativeMessagingHosts/com.second_cerveau.bridge.json`.
   Its `allowed_origins` field must contain the current extension id.
4. Start the launcher by hand: `~/.local/share/second-cerveau/host.sh` should start without errors (quit with Ctrl+C).

**Results look old:** check `syncedAt` in the answer. The copy is sent about a second after each change; the extension must be running in an open browser.

**Remove everything:**

```sh
node mcp/install.mjs --uninstall
claude mcp remove mindrop
```

The copy and the backups stay on disk; delete the `~/.local/share/second-cerveau/` folder if you no longer want them.

## Technical names

The extension was called "Second Cerveau" before it became Mindrop. A few technical names kept the old name on purpose: the `~/.local/share/second-cerveau/` folder (copy and backups), the `com.second_cerveau.bridge` native host and the extension's internal database. Renaming them would cut an installed bridge, lose the backups and make the memories disappear. They show nowhere in the extension.

## Privacy

- Everything stays on your machine: neither the extension nor the server sends anything over the Internet.
- `brain.json`, the backups and their folder are readable by your account only.
- Only your extension, identified by its id, can talk to the bridge.
- **What the agent reads is sent to the AI model it uses.** If your agent runs on an online model, the memories it looks at go to that service, like anything else you show it.
