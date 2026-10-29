<?php
/**
 * Folder taxonomy, capabilities and folder helpers.
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Virtual media folders stored as a private attachment taxonomy.
 */
class FMM_Taxonomy {

	/**
	 * Taxonomy name.
	 */
	const NAME = 'fmm_folder';

	/**
	 * Maximum folder name length (wp_terms.name is varchar(200)).
	 */
	const MAX_NAME_LENGTH = 200;

	/**
	 * Term meta key of the manual folder position among siblings.
	 */
	const ORDER_META = 'fmm_order';

	/**
	 * User meta key of the folder sort mode.
	 */
	const SORT_META = 'fmm_folder_sort';

	/**
	 * Term meta key of the folder color. Gray (default) stores nothing.
	 */
	const COLOR_META = 'fmm_color';

	/**
	 * Preset folder colors.
	 */
	const COLOR_PRESETS = array( 'blue', 'violet', 'sand', 'green' );

	/**
	 * Term meta key of the folder icon. The plain folder (default) stores nothing.
	 */
	const ICON_META = 'fmm_icon';

	/**
	 * Folder icons: glyphs drawn on the folder (see FMM_Icons::GLYPHS).
	 */
	const ICONS = array( 'image', 'video', 'document', 'audio', 'archive', 'star', 'people', 'tag' );

	/**
	 * Available folder sort modes.
	 */
	const SORT_MODES = array( 'name_asc', 'name_desc', 'newest', 'oldest', 'manual' );

	/**
	 * Registers the taxonomy.
	 */
	public static function register() {
		$manage = self::manage_capability();

		register_taxonomy(
			self::NAME,
			'attachment',
			array(
				'labels'                => array(
					'name'          => __( 'Folders', 'fena-media-manager' ),
					'singular_name' => __( 'Folder', 'fena-media-manager' ),
					'all_items'     => __( 'All Media', 'fena-media-manager' ),
					'add_new_item'  => __( 'New Folder', 'fena-media-manager' ),
					'edit_item'     => __( 'Rename Folder', 'fena-media-manager' ),
					'not_found'     => __( 'No folders yet.', 'fena-media-manager' ),
				),
				'public'                => false,
				'publicly_queryable'    => false,
				'hierarchical'          => true,
				'show_ui'               => false,
				'show_in_menu'          => false,
				'show_in_nav_menus'     => false,
				'show_tagcloud'         => false,
				'show_in_quick_edit'    => false,
				'show_admin_column'     => false,
				'show_in_rest'          => false,
				'query_var'             => self::NAME,
				'rewrite'               => false,
				'update_count_callback' => '_update_generic_term_count',
				'capabilities'          => array(
					'manage_terms' => $manage,
					'edit_terms'   => $manage,
					'delete_terms' => $manage,
					'assign_terms' => 'upload_files',
				),
			)
		);

		register_term_meta(
			self::NAME,
			self::ORDER_META,
			array(
				'type'              => 'integer',
				'single'            => true,
				'sanitize_callback' => 'absint',
				'show_in_rest'      => false,
			)
		);

		register_term_meta(
			self::NAME,
			self::COLOR_META,
			array(
				'type'              => 'string',
				'single'            => true,
				'sanitize_callback' => array( __CLASS__, 'sanitize_color' ),
				'show_in_rest'      => false,
			)
		);

		register_term_meta(
			self::NAME,
			self::ICON_META,
			array(
				'type'              => 'string',
				'single'            => true,
				'sanitize_callback' => array( __CLASS__, 'sanitize_icon' ),
				'show_in_rest'      => false,
			)
		);
	}

	/**
	 * Sanitizes a folder icon key.
	 *
	 * @param mixed $raw Raw icon.
	 * @return string Key from ICONS, or '' (plain folder / invalid).
	 */
	public static function sanitize_icon( $raw ) {
		return is_string( $raw ) && in_array( $raw, self::ICONS, true ) ? $raw : '';
	}

	/**
	 * Sanitizes a folder color: a preset key or a lowercase #rrggbb value.
	 *
	 * @param mixed $raw Raw color.
	 * @return string Preset key, hex color, or '' (gray / invalid).
	 */
	public static function sanitize_color( $raw ) {
		$raw = is_string( $raw ) ? $raw : '';

		if ( in_array( $raw, self::COLOR_PRESETS, true ) ) {
			return $raw;
		}

		return preg_match( '/^#[0-9a-f]{6}$/i', $raw ) ? strtolower( $raw ) : '';
	}

	/**
	 * Folder sort mode of the current user.
	 *
	 * @return string One of SORT_MODES.
	 */
	public static function sort_mode() {
		$mode = get_user_meta( get_current_user_id(), self::SORT_META, true );

		return in_array( $mode, self::SORT_MODES, true ) ? $mode : self::default_sort_mode();
	}

	/**
	 * Sort mode for users who have not chosen one.
	 *
	 * @return string One of SORT_MODES.
	 */
	private static function default_sort_mode() {
		return FMM_Settings::get( 'default_sort' );
	}

	/**
	 * Saves the folder sort mode of the current user.
	 *
	 * @param string $mode One of SORT_MODES.
	 * @return bool Whether the mode was valid and stored.
	 */
	public static function set_sort_mode( $mode ) {
		if ( ! in_array( $mode, self::SORT_MODES, true ) ) {
			return false;
		}

		update_user_meta( get_current_user_id(), self::SORT_META, $mode );

		return true;
	}

	/**
	 * Capability required to create, rename and delete folders.
	 *
	 * @return string
	 */
	public static function manage_capability() {
		return (string) apply_filters( 'fmm_manage_folders_capability', 'edit_others_posts' );
	}

	/**
	 * Returns a capability of the registered taxonomy.
	 *
	 * @param string $cap Capability key (manage_terms, assign_terms, ...).
	 * @return string
	 */
	private static function cap( $cap ) {
		$taxonomy = get_taxonomy( self::NAME );
		return $taxonomy ? $taxonomy->cap->$cap : 'do_not_allow';
	}

	/**
	 * Whether the current user may see folders.
	 *
	 * @return bool
	 */
	public static function can_read() {
		return current_user_can( 'upload_files' );
	}

	/**
	 * Whether the current user may create, rename and delete folders.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( self::cap( 'manage_terms' ) );
	}

	/**
	 * Whether the current user may assign folders at all.
	 *
	 * @return bool
	 */
	public static function can_assign_any() {
		return current_user_can( self::cap( 'assign_terms' ) );
	}

	/**
	 * Whether the current user may change the folders of one attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool
	 */
	public static function can_assign( $attachment_id ) {
		$attachment_id = (int) $attachment_id;

		return $attachment_id > 0
			&& 'attachment' === get_post_type( $attachment_id )
			&& self::can_assign_any()
			&& current_user_can( 'edit_post', $attachment_id );
	}

	/**
	 * Removes folder relationships from objects that are not attachments
	 * (set_object_terms action). wp_set_object_terms() offers no filter to
	 * reject terms and core's tax_input handling does not check the post
	 * type, so every assignment path is corrected here. wp_remove_object_terms() does not
	 * fire set_object_terms (no recursion) and updates the folder counts.
	 *
	 * @param int    $object_id Object ID.
	 * @param array  $terms     Terms passed to wp_set_object_terms().
	 * @param array  $tt_ids    Term taxonomy IDs.
	 * @param string $taxonomy  Taxonomy.
	 */
	public static function restrict_to_attachments( $object_id, $terms, $tt_ids, $taxonomy ) {
		if ( self::NAME === $taxonomy && 'attachment' !== get_post_type( $object_id ) ) {
			wp_delete_object_term_relationships( $object_id, self::NAME );
		}
	}

	/**
	 * Adds or removes validated folders for many attachments. Each attachment
	 * is checked with can_assign(); other folder assignments stay untouched.
	 *
	 * @param array $attachment_ids Attachment IDs.
	 * @param int[] $folder_ids     Existing folder IDs (validated by the caller).
	 * @param bool  $add            True to add, false to remove.
	 * @return array { updated: [ { id, folders } ], skipped: [ { id, reason } ] }
	 */
	public static function assign( $attachment_ids, $folder_ids, $add ) {
		return $add
			? self::update_folders( $attachment_ids, $folder_ids, array() )
			: self::update_folders( $attachment_ids, array(), $folder_ids );
	}

	/**
	 * Moves attachments from one folder to others: the target folders are
	 * added and only the source folder is removed, so every other folder
	 * assignment stays untouched.
	 *
	 * @param array $attachment_ids Attachment IDs.
	 * @param int[] $folder_ids     Existing target folder IDs (validated by the caller).
	 * @param int   $source_id      Existing source folder ID (validated by the caller).
	 * @return array Same format as assign().
	 */
	public static function move( $attachment_ids, $folder_ids, $source_id ) {
		$folder_ids = array_map( 'intval', $folder_ids );

		return self::update_folders( $attachment_ids, $folder_ids, array_diff( array( (int) $source_id ), $folder_ids ) );
	}

	/**
	 * Adds and removes folders for many attachments; each attachment is
	 * checked with can_assign().
	 *
	 * @param array $attachment_ids Attachment IDs.
	 * @param int[] $add_ids        Folder IDs to add.
	 * @param int[] $remove_ids     Folder IDs to remove.
	 * @return array { updated: [ { id, folders } ], skipped: [ { id, reason } ] }
	 */
	private static function update_folders( $attachment_ids, $add_ids, $remove_ids ) {
		$add_ids    = array_values( array_map( 'intval', $add_ids ) );
		$remove_ids = array_values( array_map( 'intval', $remove_ids ) );
		$updated    = array();
		$skipped    = array();

		foreach ( array_unique( array_map( 'intval', (array) $attachment_ids ) ) as $id ) {
			if ( 'attachment' !== get_post_type( $id ) ) {
				$skipped[] = array(
					'id'     => $id,
					'reason' => 'not_attachment',
				);
				continue;
			}

			if ( ! self::can_assign( $id ) ) {
				$skipped[] = array(
					'id'     => $id,
					'reason' => 'forbidden',
				);
				continue;
			}

			// Integer term IDs are required; strings would be treated as names.
			$result = $add_ids ? wp_set_object_terms( $id, $add_ids, self::NAME, true ) : true;
			if ( ! is_wp_error( $result ) && $remove_ids ) {
				$result = wp_remove_object_terms( $id, $remove_ids, self::NAME );
			}

			if ( is_wp_error( $result ) ) {
				$skipped[] = array(
					'id'     => $id,
					'reason' => 'error',
				);
				continue;
			}

			$updated[] = array(
				'id'      => $id,
				'folders' => self::get_attachment_folder_ids( $id ),
			);
		}

		return array(
			'updated' => $updated,
			'skipped' => $skipped,
		);
	}

	/**
	 * Returns a folder term, or null when the ID is not a folder.
	 *
	 * @param int $id Term ID.
	 * @return WP_Term|null
	 */
	public static function get_folder( $id ) {
		$id = (int) $id;
		if ( $id <= 0 ) {
			return null;
		}

		$term = get_term( $id, self::NAME );

		return ( $term instanceof WP_Term && self::NAME === $term->taxonomy ) ? $term : null;
	}

	/**
	 * Keeps only IDs that belong to existing folders.
	 *
	 * @param array $ids Raw IDs.
	 * @return int[]
	 */
	public static function filter_folder_ids( $ids ) {
		$valid = array();
		foreach ( array_unique( array_map( 'intval', (array) $ids ) ) as $id ) {
			if ( self::get_folder( $id ) ) {
				$valid[] = $id;
			}
		}
		return $valid;
	}

	/**
	 * Folder IDs assigned to an attachment.
	 *
	 * @param int|WP_Post $attachment Attachment.
	 * @return int[]
	 */
	public static function get_attachment_folder_ids( $attachment ) {
		$terms = get_the_terms( $attachment, self::NAME );
		if ( ! is_array( $terms ) ) {
			return array();
		}
		return array_map( 'intval', wp_list_pluck( $terms, 'term_id' ) );
	}

	/**
	 * Prepares a folder for API responses.
	 *
	 * @param WP_Term $term Folder term.
	 * @return array
	 */
	public static function prepare_folder( WP_Term $term ) {
		// Core stores term names HTML-encoded ("Logos &amp; Icons"); the API
		// returns plain text, clients must escape it on output.
		return array(
			'id'     => (int) $term->term_id,
			'name'   => wp_specialchars_decode( $term->name, ENT_QUOTES ),
			'parent' => (int) $term->parent,
			'count'  => (int) $term->count,
			'order'  => (int) get_term_meta( $term->term_id, self::ORDER_META, true ),
			'color'  => self::sanitize_color( get_term_meta( $term->term_id, self::COLOR_META, true ) ),
			'icon'   => self::sanitize_icon( get_term_meta( $term->term_id, self::ICON_META, true ) ),
		);
	}

	/**
	 * All folders in the given sort mode. Newest and oldest use the term ID:
	 * IDs are assigned in creation order and WordPress stores no term date.
	 * Manual order sorts by the `order` meta, ties by name. Hierarchy is
	 * applied by the callers; the order only matters among siblings.
	 *
	 * @param string|null $mode One of SORT_MODES; defaults to the sort mode of the current user.
	 * @return array[]
	 */
	public static function get_folders( $mode = null ) {
		$mode = in_array( $mode, self::SORT_MODES, true ) ? $mode : self::sort_mode();
		$args = array(
			'taxonomy'   => self::NAME,
			'hide_empty' => false,
			'orderby'    => 'name',
			'order'      => 'name_desc' === $mode ? 'DESC' : 'ASC',
		);

		if ( 'newest' === $mode || 'oldest' === $mode ) {
			$args['orderby'] = 'term_id';
			$args['order']   = 'newest' === $mode ? 'DESC' : 'ASC';
		}

		$terms = get_terms( $args );

		if ( ! is_array( $terms ) ) {
			return array();
		}

		$folders = array_map( array( __CLASS__, 'prepare_folder' ), $terms );

		if ( 'manual' === $mode ) {
			// usort() is not stable before PHP 8: the name position is the tiebreak.
			foreach ( $folders as $index => $folder ) {
				$folders[ $index ]['position'] = $index;
			}
			usort(
				$folders,
				function ( $a, $b ) {
					return array( $a['order'], $a['position'] ) <=> array( $b['order'], $b['position'] );
				}
			);
			foreach ( $folders as $index => $folder ) {
				unset( $folders[ $index ]['position'] );
			}
		}

		return $folders;
	}

	/**
	 * Groups folders by effective parent. A folder whose parent does not
	 * exist counts as top level (0), as in store.tree().
	 *
	 * @param array[] $folders Folders from get_folders().
	 * @return array[] Parent ID => folders.
	 */
	private static function group_by_parent( $folders ) {
		$ids      = wp_list_pluck( $folders, 'id' );
		$children = array();
		foreach ( $folders as $folder ) {
			$children[ in_array( $folder['parent'], $ids, true ) ? $folder['parent'] : 0 ][] = $folder;
		}

		return $children;
	}

	/**
	 * IDs of the folders directly below a parent, in folder order.
	 *
	 * @param int          $parent_id Parent folder ID, 0 for the top level.
	 * @param array[]|null $folders   Folders from get_folders(); loaded when null.
	 * @return int[]
	 */
	public static function child_ids( $parent_id, $folders = null ) {
		$children = self::group_by_parent( null === $folders ? self::get_folders() : $folders );
		$siblings = isset( $children[ (int) $parent_id ] ) ? $children[ (int) $parent_id ] : array();

		return array_map( 'intval', wp_list_pluck( $siblings, 'id' ) );
	}

	/**
	 * Whether a folder named like this already exists below a parent.
	 * Case-insensitive; orphans count as top level (see child_ids()).
	 *
	 * @param string $name       Plain-text name.
	 * @param int    $parent_id  Parent folder ID, 0 for the top level.
	 * @param int    $exclude_id Folder ID to ignore (the folder being renamed or moved).
	 * @return bool
	 */
	public static function name_exists( $name, $parent_id, $exclude_id = 0 ) {
		$folders = self::get_folders();
		$ids     = self::child_ids( $parent_id, $folders );
		$name    = mb_strtolower( $name );

		foreach ( $folders as $folder ) {
			if ( $folder['id'] !== (int) $exclude_id && in_array( $folder['id'], $ids, true ) && mb_strtolower( $folder['name'] ) === $name ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Whether a folder may be moved below a parent: not into itself or one
	 * of its subfolders. Checked here because core's term loop check would
	 * silently re-parent another folder instead.
	 *
	 * @param int $folder_id Folder ID.
	 * @param int $parent_id New parent folder ID, 0 for the top level.
	 * @return bool
	 */
	public static function is_valid_parent( $folder_id, $parent_id ) {
		$folder_id = (int) $folder_id;
		$parent_id = (int) $parent_id;

		return 0 === $parent_id || (
			null !== self::get_folder( $parent_id )
			&& $parent_id !== $folder_id
			&& ! in_array( $folder_id, array_map( 'intval', get_ancestors( $parent_id, self::NAME, 'taxonomy' ) ), true )
		);
	}

	/**
	 * Manual position for a new folder: after all of its siblings.
	 *
	 * @param int $parent_id Parent folder ID, 0 for the top level.
	 * @return int
	 */
	public static function next_order( $parent_id ) {
		$folders = self::get_folders( 'manual' );
		$ids     = self::child_ids( $parent_id, $folders );
		$orders  = array();
		foreach ( $folders as $folder ) {
			if ( in_array( $folder['id'], $ids, true ) ) {
				$orders[] = $folder['order'];
			}
		}

		return $orders ? max( $orders ) + 1 : 0;
	}

	/**
	 * Stores the manual order of the folders below a parent. The IDs must be
	 * exactly the current children, so concurrent changes are not overwritten.
	 *
	 * @param int   $parent_id Parent folder ID, 0 for the top level.
	 * @param array $ids       Folder IDs in the new order.
	 * @return true|WP_Error
	 */
	public static function reorder( $parent_id, $ids ) {
		$ids      = array_map( 'intval', (array) $ids );
		$expected = self::child_ids( $parent_id );
		$sorted   = $ids;
		sort( $sorted );
		sort( $expected );

		if ( count( array_unique( $ids ) ) !== count( $ids ) || $sorted !== $expected ) {
			return new WP_Error(
				'fmm_order_conflict',
				__( 'The folders have changed in the meantime. Please try again.', 'fena-media-manager' ),
				array( 'status' => 409 )
			);
		}

		foreach ( $ids as $position => $id ) {
			update_term_meta( $id, self::ORDER_META, $position );
		}

		return true;
	}

	/**
	 * All folders in tree order (depth first, siblings in the sort mode of
	 * the current user, or the given mode) with their `depth`. Folders whose
	 * parent is missing are shown at the top level. Same order as
	 * store.tree() in fmm-media-filter.js.
	 *
	 * @param string|null $mode One of SORT_MODES; defaults to the sort mode of the current user.
	 * @return array[]
	 */
	public static function get_folder_tree( $mode = null ) {
		$children = self::group_by_parent( self::get_folders( $mode ) );

		$tree = array();
		$walk = function ( $parent_id, $depth ) use ( &$walk, &$tree, $children ) {
			foreach ( isset( $children[ $parent_id ] ) ? $children[ $parent_id ] : array() as $folder ) {
				$folder['depth'] = $depth;
				$tree[]          = $folder;
				$walk( $folder['id'], $depth + 1 );
			}
		};
		$walk( 0, 0 );

		return $tree;
	}

	/**
	 * Plain-text option label of a tree folder: one "— " per level, as in
	 * the media modal filter. Callers must escape it.
	 *
	 * @param array $folder Folder from get_folder_tree().
	 * @return string
	 */
	public static function tree_label( $folder ) {
		return str_repeat( '— ', (int) $folder['depth'] ) . $folder['name'];
	}

	/**
	 * Sanitizes a folder name.
	 *
	 * @param mixed $raw Raw name.
	 * @return string
	 */
	public static function sanitize_name( $raw ) {
		return trim( sanitize_text_field( is_scalar( $raw ) ? (string) $raw : '' ) );
	}

	/**
	 * Validates a sanitized folder name.
	 *
	 * @param string $name Sanitized name.
	 * @return true|WP_Error
	 */
	public static function validate_name( $name ) {
		if ( '' === $name || mb_strlen( $name ) > self::MAX_NAME_LENGTH ) {
			return new WP_Error(
				'fmm_invalid_name',
				sprintf(
					/* translators: %d: maximum number of characters. */
					__( 'Folder names must contain 1 to %d characters.', 'fena-media-manager' ),
					self::MAX_NAME_LENGTH
				),
				array( 'status' => 400 )
			);
		}
		return true;
	}
}
