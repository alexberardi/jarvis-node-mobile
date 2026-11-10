# Inbox attachments on mobile (images and video)

Status: accepted (mobile side, piece 2 of the ComfyUI plan). Date: 2026-10-18.

The ComfyUI plan delivers generated media through the inbox:
(1) jarvisd stores inbox attachments, (2) mobile shows them (this file),
(3) the SDK's inbox API takes attachments, (4) the Python node passes them
through, (5) `jarvis-cmd-comfyui` makes the media.

Piece 1 was not readable when this was built, so the mobile side first read
a contract of its own guessing, which jarvisd never sent (#218). The wire
shape below is now piece 1's.

## Wire shape

jarvisd (jarvis-server `internal/modules/notifications/attachments.go`,
`type Attachment`) lists an item's attachments at the top level:

```json
{
  "id": "<item_id>",
  "title": "Your picture is ready",
  "attachments": [
    { "id": "att_1", "mime": "image/png", "size": 1832211, "width": 1024, "height": 1024, "duration_ms": null },
    { "id": "att_2", "mime": "video/mp4", "size": 912334, "width": null, "height": null, "duration_ms": null }
  ]
}
```

- Each file is served at `GET /api/v0/inbox/<item_id>/attachments/<id>`,
  to the item's user only. There is no thumbnail endpoint.
- The kind comes from `mime`: `image/*` is an image, `video/*` a video,
  anything else is dropped. The server allows image/png, jpeg, webp, gif and
  video/mp4, webm.
- `width`, `height` and `duration_ms` may be `null` (no video parsing yet).
- Items without attachments have no `attachments` key.
- The app maps this onto its own `InboxAttachment` (`kind`, `url`,
  `mime_type`, `size_bytes`, `duration_seconds`, …). An entry that already
  carries `kind` and `url` (the shape this doc first proposed) is still
  taken as given, and `metadata.attachments` is read when the top-level
  field is absent; top-level wins when both are present.
- `__tests__/services/inboxAttachmentsContract.test.ts` pins the server's
  shape with a fixture copied from the server's
  `TestInboxAttachmentsRoundTrip`, so the two cannot drift silently (#218).

## Decisions

1. **Older servers keep working.** No field, `null`, a non-list or garbage
   means "no attachments": nothing is rendered and nothing else changes.
   Entries with an unknown `kind` or `mime`, no `url` (or `id` to build it
   from), or wrongly typed optional fields are dropped one by one;
   the rest still show. At most 10 are shown.
2. **Downloads are authenticated with the user's JWT**
   (`Authorization: Bearer …`). No presigned or public URLs, same as the
   phone-call audio. Relative URLs resolve against the notifications
   service URL (where the inbox API lives); absolute URLs are used as given.
3. **Download to the cache, then show the local file.** Media goes through
   `FileSystem.downloadAsync` into `cache/inbox-media/`, one file per URL,
   with an extension from `mime_type`, the filename or the URL (the photo
   library needs one). The local file is what the image, the video player,
   Save and Share all use. `downloadAsync` skips the axios refresh
   interceptor, so a 401 refreshes the token once (`refreshAuthToken`) and
   retries once. Any other non-200 deletes the partial file and shows an
   error with Retry.
4. **List row:** a small thumbnail when the item has an attachment. It uses
   `thumbnail_url` when given, else the image itself; a video without a
   thumbnail shows a video icon.
5. **Detail screen:** a strip of attachments under the body. Tapping one
   opens a full-screen viewer: images with pinch zoom (gesture-handler +
   reanimated, double tap to reset), videos with `expo-video`'s `VideoView`
   and native controls.
6. **Save to photos** uses `expo-media-library` and asks for write-only
   permission only when Save is pressed. A refusal shows a message; nothing
   is asked up front. On Android the config plugin is set to declare no
   `READ_MEDIA_*` permissions (`granularPermissions: []`): the app only
   writes to the gallery, and Google Play restricts the read permissions.
7. **Share** uses `expo-sharing` on the local file.
8. **testIDs** for E2E: `inbox-item-thumb-<item id>` (list),
   `inbox-attachment-<index>` (detail strip), `attachment-viewer`,
   `attachment-image`, `attachment-video`, `attachment-save`,
   `attachment-share`, `attachment-close`, `attachment-loading`,
   `attachment-error`, `attachment-retry`.

## What piece 1 needs to provide

- the `attachments` list on `GET /api/v0/inbox` and `GET /api/v0/inbox/{id}`;
- an endpoint per attachment (and optionally its thumbnail) that serves the
  bytes with the right `Content-Type` to the owning user's JWT, and 401/403
  otherwise.
