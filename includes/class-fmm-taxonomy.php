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
		);
	}

	/**
	 * All folders, sorted by name.
	 *
	 * @return array[]
	 */
	public static function get_folders() {
		$terms = get_terms(
			array(
				'taxonomy'   => self::NAME,
				'hide_empty' => false,
				'orderby'    => 'name',
				'order'      => 'ASC',
			)
		);

		if ( ! is_array( $terms ) ) {
			return array();
		}

		return array_map( array( __CLASS__, 'prepare_folder' ), $terms );
	}

	/**
	 * All folders in tree order (depth first, siblings by name) with their
	 * `depth`. Folders whose parent is missing are shown at the top level.
	 * Same order as store.tree() in fmm-media-filter.js.
	 *
	 * @return array[]
	 */
	public static function get_folder_tree() {
		$folders  = self::get_folders();
		$ids      = wp_list_pluck( $folders, 'id' );
		$children = array();
		foreach ( $folders as $folder ) {
			$children[ in_array( $folder['parent'], $ids, true ) ? $folder['parent'] : 0 ][] = $folder;
		}

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
