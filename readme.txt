=== Fena Media Manager ===
Tags: media, media library, folders, organize, attachments
Requires at least: 6.4
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Virtual folders for the WordPress media library.

== Description ==

Adds simple virtual folders to the native media library. Folders are stored
as a private attachment taxonomy (`fmm_folder`). Files, URLs and attachment
data are never changed; one file can be in several folders.

* Folder sidebar in Media > Library (grid view) with "All Media", "Unassigned"
  and media counts per folder.
* Subfolders in any depth, shown as a collapsible tree (collapsed on load).
* Folder sorting among siblings: name A–Z or Z–A, newest or oldest first, or manual
  order (drag and drop or "Move up"/"Move down"). The sort mode is a per-user
  setting; the manual order is shared by all users.
* Folder filter in the grid, in the list view and in the media modal, so it is
  also available in the Customizer and in the block editor.
* Uploads go into the active folder (single and multiple files, media library
  and media modal). Under "All Media" or "Unassigned" uploads stay unassigned.
* Drag and drop media onto folders: inside a folder view dragging moves media
  out of the active folder (other folders are kept), Ctrl/Cmd adds instead.
  In "All Media" and "Unassigned" dragging adds.
* Bulk selection: add (+), move (→) or remove (−) the selection per folder.
* List view bulk actions "Add to folder" and "Remove from folder".
* Folder checkboxes in the attachment details.
* Keyboard operable, with visible focus, screen reader labels and announcements.
* Administrators and editors create, rename and delete folders.
* Everyone who may edit a media file can assign it to existing folders;
  permissions are checked on the server for every file.
* Six editable example folders are created once on first activation.
* Deactivating or deleting the plugin keeps all folders and assignments.

== Installation ==

1. Upload the `fena-media-manager` folder to `/wp-content/plugins/`, or install
   the release ZIP via Plugins > Add New > Upload Plugin.
2. Activate the plugin.
3. Open Media > Library and use the folder sidebar.

== Frequently Asked Questions ==

= Are files moved on the server? =

No. Folders are virtual. Files, URLs, attachment IDs and metadata stay unchanged.

= What happens when a folder is deleted? =

Only the folder is removed; its media stays in the library. Subfolders move up
one level.

= Does the block editor inserter show folders? =

The "Media" tab of the block inserter uses a REST view without folder support.
The media modal ("Media Library" button) has the folder filter.

= Can the permissions or default folders be changed? =

Yes, with the filters `fmm_manage_folders_capability` (default
`edit_others_posts`) and `fmm_default_folders`.

`fmm_manage_folders_capability` is security relevant: every user with the
returned capability may create, rename and delete folders for the whole site.
Return a capability that only trusted roles have, never `read` or
`upload_files`. Assigning media is not affected; it always requires
`upload_files` plus permission to edit the media file.

== Changelog ==

= 1.0.0 =
* Folder taxonomy, permissions, default folders and REST API (`fmm/v1`).
* Folder sidebar with create, rename and delete in the media library grid.
* Folder filter in the grid, list view and media modal.
* Multiple folders per file, bulk add/remove and drag and drop.
* Move media between folders (drag and drop, → button) while keeping other folder assignments.
* Uploads are assigned to the active folder.
* Subfolders with a collapsible tree in the sidebar and indented folder lists.
* Folder sorting (A–Z, Z–A, newest, oldest, manual order) with a per-user sort mode.
* Folder checkboxes in the attachment details.
* Folders can only be assigned to attachments; assignments to posts, pages and other post types are removed.
* Asset versions use the file modification time in local and development environments.
