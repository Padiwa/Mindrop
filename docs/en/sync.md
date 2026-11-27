# Sync over WebDAV

Sync keeps **the same memories on all your computers**, through your own WebDAV server. It is **off by default**. Without it, nothing leaves your browser.

WebDAV is a standard file protocol: Nextcloud, ownCloud, most NAS (Synology, QNAP…), Apache or rclone all offer it. Mindrop has been tested with Nextcloud, Apache and rclone. There is no program or local bridge to install.

## What you need

- An account on a WebDAV server, your own or a provider's, with an `https://` address.
- Its user and password.

**With Nextcloud or ownCloud**, use an **app password**, not your account password: **Personal settings**, **Security**, **Create new app password**. Give it a name ("Mindrop") and copy the password it shows. An app password only gives access to your files, and you can revoke it at any time in the same place, without touching your account password.

To check that a server is suitable before using it, run `MINDROP_DAV_PASSWORD=… npm run check:webdav -- <WebDAV address> <user>` from Mindrop's source code (Node 22 or later). It runs a full sync, unencrypted and encrypted, in a temporary folder that it deletes afterwards.

## Connect a computer

1. Open the Mindrop page, then, in the **Settings** of the left column, **Sync**, **Connect a WebDAV server**.
2. Fill in:
   - **Server address:** the server's WebDAV address, for example `https://nas.example.com/dav/`. For Nextcloud, its plain address (`https://cloud.example.com`) is enough; the full WebDAV address, shown in Files, Settings, works too.
   - **User** and **Password:** your login on the server (for Nextcloud, the app password).
   - **Folder:** `Mindrop` by default. It is created if it does not exist.
   - **Encryption passphrase:** optional, but recommended. See "Encryption" below.
3. Click **Connect**. The browser asks for permission to reach this server. Accept: Mindrop only reaches this server.

The first sync starts right away. After that, it runs **30 seconds after each change**, when the browser starts and **every 15 minutes**. The **Sync now** button runs it on demand.

Repeat these steps on each computer, with the same server and the same folder. With Nextcloud, you can use the same app password, or one per computer so you can revoke them separately.

The memories already on each computer are **combined**: nothing is lost when you connect a second computer that already has memories of its own.

## Encryption

With a **passphrase**, everything is encrypted on your computer before it is sent. The server, and anyone with access to it, only sees unreadable files: not your texts, images, tags or page addresses.

- **Make it long**: at least 12 characters, better several words ("toast piano tide 1987"). Use it only for Mindrop: do not reuse a password you use elsewhere.
- **Enter the same one on every computer.** The first computer that connects with a passphrase encrypts the folder; the next ones must give the same one, or Mindrop rejects it.
- **Keep it safe.** Nobody can recover it, neither Mindrop nor the server's administrator. If you forget it, the copy on the server becomes unreadable; your memories stay on your computers. Start again with a new folder.
- The passphrase is never stored. Mindrop only keeps, on this computer, the key drawn from it.

**Encrypting a folder that was not encrypted:** disconnect one computer, then connect it again with a passphrase. It rewrites the whole folder encrypted and deletes the unencrypted copies. The other computers then stop with the message "This folder is now encrypted": disconnect them and connect them again with the same passphrase.

**Changing the passphrase, or going back to an unencrypted folder:** disconnect each computer, delete the `Mindrop` folder on the server (or pick another folder name), then connect them again. Nothing is lost: each computer keeps its memories and sends them again.

Technical details: the key is drawn from the passphrase with PBKDF2-SHA-256 (600,000 iterations, a random salt per folder); content is encrypted with AES-256-GCM, each file bound to its location; images are named by an HMAC, so a known image cannot be recognised by its name. The `mindrop.json` file at the root of the folder holds the salt and a check value, which tells a wrong passphrase apart; it does not give the key.

## How it works

In the `Mindrop` folder on your server:

```
Mindrop/
  devices/<device>.json   one file per computer: its memories and its deletions
  images/<digest>.jpg     screenshots and dropped images, once each (.bin when encrypted)
  mindrop.json            only when the folder is encrypted: what checks the passphrase
```

- Each computer writes **only its own file** and reads the others'. Two computers therefore never write the same file, even at the same moment.
- For each memory, **the most recently modified version wins**. If you edit the same note on two computers before they sync, the last edit stays.
- A **deletion** reaches the other computers. If a memory was edited elsewhere *after* it was deleted here, the edit wins and the memory stays.
- Images are stored apart, under a name drawn from their content: an image is uploaded once, even if several memories use it. Those no memory uses any more are removed after a day.
- Deletions are remembered for 180 days. A computer left offline for longer can bring back memories deleted in the meantime.

Each computer's clock decides between two versions: keep it on time (the default setting of every system).

## The status, in Settings

Under **Sync**, a line gives the actual state:

- **Up to date 2 minutes ago with cloud.example.com, 3 devices:** all is well.
- **Images sent by another device are still on their way:** another computer is uploading its images. The memories that use them arrive on the next pass.
- **… rejects the user or password:** the password was changed or revoked. Disconnect, then connect again with the right one.
- **… does not answer:** server or connection unavailable; it tries again on its own.
- **Your space is full:** free some space on the server.
- **… keeps a file of the folder locked:** the server holds a file, most often because it is open in its web interface (Nextcloud's editor locks it while it is open). Close it; it tries again on its own. Avoid opening the files of the `Mindrop` folder in the editor.
- **This folder is now encrypted:** another computer encrypted it. Disconnect, then connect again with the passphrase.
- **The folder's key changed:** the folder was recreated with another passphrase. Connect again with the new one.
- **A file cannot be decrypted:** it was altered on the server. Mindrop applies nothing from that file.

At the end of the line, "End-to-end encrypted" tells that the folder is encrypted.

## Disconnect

**Disconnect** stops sync on this computer and removes the permission to reach the server. **Nothing is deleted**, neither here nor on the server: the other computers keep syncing with each other.

To stop everything, disconnect each computer, then delete the `Mindrop` folder on the server. The file of a computer you no longer use can be deleted from `Mindrop/devices/`: the memories stay on the other computers.

## Privacy

- **With a passphrase**, the server only sees encrypted files. It still sees their number, size and modification dates: how many computers, how many images, when you use it.
- **Without a passphrase**, your memories, texts and images included, are copied **unencrypted** to the folder on your server. Anyone with access to that folder can read them, including the server's administrator.
- Mindrop only reaches the server you entered, and only with the permission you gave.
- The address, user, password and encryption key are kept in the extension's storage, on this computer. The browser does not sync them. Someone with access to your session on this computer has access to your memories anyway.
- Sync does not depend on agent access or on automatic backups: the three are set separately.
