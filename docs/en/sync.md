# Sync with Nextcloud

Sync keeps **the same memories on all your computers**, through your own Nextcloud server. It is **off by default**. Without it, nothing leaves your browser.

It goes through WebDAV, Nextcloud's file protocol. It also works with ownCloud and other WebDAV servers. There is no program or local bridge to install.

## What you need

- An account on a Nextcloud server, your own or a provider's, with an `https://` address.
- An **app password**, not your account password. In Nextcloud: **Personal settings**, **Security**, **Create new app password**. Give it a name ("Mindrop") and copy the password it shows.

An app password only gives access to your files. You can revoke it at any time in the same place, without touching your account password.

## Connect a computer

1. Open the Mindrop page, then, in the **Settings** of the left column, **Sync**, **Connect Nextcloud**.
2. Fill in:
   - **Server address:** for example `https://cloud.example.com`. The full WebDAV address, shown in Files, Settings, works too.
   - **User:** your Nextcloud login.
   - **App password:** the one you just created.
   - **Folder:** `Mindrop` by default. It is created if it does not exist.
3. Click **Connect**. The browser asks for permission to reach this server. Accept: Mindrop only reaches this server.

The first sync starts right away. After that, it runs **30 seconds after each change**, when the browser starts and **every 15 minutes**. The **Sync now** button runs it on demand.

Repeat these steps on each computer, with the same server and the same folder. You can use the same app password, or one per computer so you can revoke them separately.

The memories already on each computer are **combined**: nothing is lost when you connect a second computer that already has memories of its own.

## How it works

In the `Mindrop` folder of your Nextcloud:

```
Mindrop/
  devices/<device>.json   one file per computer: its memories and its deletions
  images/<digest>.jpg     screenshots and dropped images, once each
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
- **… rejects the user or password:** the app password was revoked or is wrong. Disconnect, create a new one, then connect again.
- **… does not answer:** server or connection unavailable; it tries again on its own.
- **Your space is full:** free some space in Nextcloud.

## Disconnect

**Disconnect** stops sync on this computer and removes the permission to reach the server. **Nothing is deleted**, neither here nor on the server: the other computers keep syncing with each other.

To stop everything, disconnect each computer, then delete the `Mindrop` folder in Nextcloud. The file of a computer you no longer use can be deleted from `Mindrop/devices/`: the memories stay on the other computers.

## Privacy

- Your memories, texts and images included, are copied **unencrypted** to your Nextcloud folder. Anyone with access to that folder can read them, including the server's administrator. Pick a server you trust: your own, or a provider you trust.
- Mindrop only reaches the server you entered, and only with the permission you gave.
- The address, user and app password are kept in the extension's storage, on this computer. The browser does not sync them.
- Sync does not depend on agent access or on automatic backups: the three are set separately.
