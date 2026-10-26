<?php
/**
 * Folder field in the attachment details.
 *
 * @package Fena_Media_Manager
 */

defined( 'ABSPATH' ) || exit;

/**
 * Adds folder checkboxes to the attachment details (media modal and the
 * attachment edit screen) and exposes folder IDs to the media JS models.
 */
class FMM_Attachment_Fields {

	/**
	 * Registers the filters.
	 */
	public static function init() {
		add_filter( 'attachment_fields_to_edit', array( __CLASS__, 'edit' ), 10, 2 );
		add_filter( 'attachment_fields_to_save', array( __CLASS__, 'save' ), 10, 2 );
		add_filter( 'wp_prepare_attachment_for_js', array( __CLASS__, 'prepare_for_js' ), 10, 2 );
	}

	/**
	 * Renders the folder checkboxes.
	 *
	 * Every checkbox needs a unique name: the media modal serializes the
	 * compat form into an object, so repeated "[]" names would overwrite
	 * each other.
	 *
	 * @param array   $form_fields Attachment form fields.
	 * @param WP_Post $post        Attachment.
	 * @return array
	 */
	public static function edit( $form_fields, $post ) {
		if ( ! $post instanceof WP_Post || ! FMM_Taxonomy::can_assign( $post->ID ) ) {
			return $form_fields;
		}

		$id       = (int) $post->ID;
		$base     = 'attachments[' . $id . ']';
		$folders  = FMM_Taxonomy::get_folders();
		$assigned = FMM_Taxonomy::get_attachment_folder_ids( $post );

		$html  = sprintf( '<input type="hidden" name="%s" value="1" />', esc_attr( $base . '[fmm_folders_present]' ) );
		$html .= sprintf(
			'<input type="hidden" name="%s" value="%s" />',
			esc_attr( $base . '[fmm_folders_shown]' ),
			esc_attr( implode( ',', wp_list_pluck( $folders, 'id' ) ) )
		);

		if ( empty( $folders ) ) {
			$html .= '<span class="fmm-folders-empty">' . esc_html__( 'No folders yet.', 'fena-media-manager' ) . '</span>';
		} else {
			$html .= '<span class="fmm-folders" role="group" aria-label="' . esc_attr__( 'Folders', 'fena-media-manager' ) . '">';
			foreach ( $folders as $folder ) {
				$html .= sprintf(
					'<label style="display:block"><input type="checkbox" name="%1$s" value="1"%2$s /> %3$s</label>',
					esc_attr( $base . '[fmm_folders][' . $folder['id'] . ']' ),
					checked( in_array( $folder['id'], $assigned, true ), true, false ),
					esc_html( $folder['name'] )
				);
			}
			$html .= '</span>';
		}

		$form_fields['fmm_folders'] = array(
			'label' => __( 'Folders', 'fena-media-manager' ),
			'input' => 'html',
			'html'  => $html,
		);

		return $form_fields;
	}

	/**
	 * Saves the folder checkboxes.
	 *
	 * Only folders that were rendered in the form are changed, so folders
	 * created or assigned elsewhere in the meantime stay untouched.
	 *
	 * @param array $post       Attachment post data.
	 * @param array $attachment Submitted attachment fields.
	 * @return array
	 */
	public static function save( $post, $attachment ) {
		$id = isset( $post['ID'] ) ? (int) $post['ID'] : 0;

		if ( empty( $attachment['fmm_folders_present'] ) || ! FMM_Taxonomy::can_assign( $id ) ) {
			return $post;
		}

		$shown_raw = isset( $attachment['fmm_folders_shown'] ) ? explode( ',', (string) $attachment['fmm_folders_shown'] ) : array();
		$shown     = FMM_Taxonomy::filter_folder_ids( $shown_raw );
		$checked   = isset( $attachment['fmm_folders'] ) && is_array( $attachment['fmm_folders'] )
			? array_map( 'intval', array_keys( $attachment['fmm_folders'] ) )
			: array();
		$add       = array_values( array_intersect( $shown, $checked ) );
		$remove    = array_values( array_diff( $shown, $checked ) );

		if ( $add ) {
			wp_set_object_terms( $id, $add, FMM_Taxonomy::NAME, true );
		}
		if ( $remove ) {
			wp_remove_object_terms( $id, $remove, FMM_Taxonomy::NAME );
		}

		return $post;
	}

	/**
	 * Adds the folder IDs to the attachment JSON used by the media library.
	 *
	 * @param array   $response   Attachment data.
	 * @param WP_Post $attachment Attachment.
	 * @return array
	 */
	public static function prepare_for_js( $response, $attachment ) {
		$response['fmmFolders'] = FMM_Taxonomy::get_attachment_folder_ids( $attachment );
		return $response;
	}
}
