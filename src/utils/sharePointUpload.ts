import { supabase } from "@/integrations/supabase/client";

export interface SharePointUploadResult {
  success: boolean;
  fileUrl?: string;
  fileId?: string;
  driveId?: string;
  fileName?: string;
  error?: string;
  skipped?: boolean; // True if no SharePoint config exists
}

export interface SharePointDeleteResult {
  success: boolean;
  error?: string;
  skipped?: boolean;
}

/**
 * Upload a document to SharePoint if integration is configured and enabled.
 * Returns gracefully without throwing errors to avoid breaking the main invoice flow.
 */
export async function uploadToSharePoint(
  pdfBase64: string,
  fileName: string,
  documentType: 'support_document' | 'invoice_pdf' | 'contract_pdf' = 'support_document'
): Promise<SharePointUploadResult> {
  try {
    // Check if SharePoint connection exists and is enabled
    const { data: connection, error: connectionError } = await supabase
      .from('sharepoint_connections')
      .select('id, is_enabled')
      .limit(1)
      .maybeSingle();

    if (connectionError) {
      console.error('[SharePoint] Error checking connection:', connectionError);
      return { success: false, skipped: true };
    }

    if (!connection) {
      console.log('[SharePoint] No connection configured, skipping upload');
      return { success: false, skipped: true };
    }

    if (!connection.is_enabled) {
      console.log('[SharePoint] Integration is disabled, skipping upload');
      return { success: false, skipped: true };
    }

    // Check if folder settings are configured for this document type
    const { data: folderSettings, error: folderError } = await supabase
      .from('sharepoint_folder_settings')
      .select('drive_id, folder_id')
      .eq('connection_id', connection.id)
      .eq('document_type', documentType)
      .limit(1)
      .maybeSingle();

    if (folderError) {
      console.error('[SharePoint] Error checking folder settings:', folderError);
      return { success: false, skipped: true };
    }

    if (!folderSettings) {
      console.log(`[SharePoint] No folder configured for ${documentType}, skipping upload`);
      return { success: false, skipped: true };
    }

    // Call the upload edge function
    const { data, error } = await supabase.functions.invoke('sharepoint-upload-document', {
      body: {
        driveId: folderSettings.drive_id,
        folderId: folderSettings.folder_id,
        fileName,
        fileContent: pdfBase64,
        contentType: 'application/pdf'
      }
    });

    if (error) {
      console.error('[SharePoint] Upload error:', error);
      return { success: false, error: error.message };
    }

    if (data?.success) {
      console.log('[SharePoint] Upload successful:', data.fileName);
      return {
        success: true,
        fileUrl: data.webUrl,
        fileId: data.fileId,
        driveId: folderSettings.drive_id,
        fileName: data.fileName,
      };
    }

    return { success: false, error: data?.error || 'Unknown error' };
  } catch (error) {
    console.error('[SharePoint] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Upload multiple documents to SharePoint in parallel.
 * Returns results for all uploads without blocking on failures.
 */
export async function uploadMultipleToSharePoint(
  documents: Array<{
    pdfBase64: string;
    fileName: string;
    documentType?: 'support_document' | 'invoice_pdf' | 'contract_pdf';
  }>
): Promise<SharePointUploadResult[]> {
  const results = await Promise.allSettled(
    documents.map(doc => 
      uploadToSharePoint(doc.pdfBase64, doc.fileName, doc.documentType || 'support_document')
    )
  );

  return results.map(result => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return { success: false, error: 'Upload failed unexpectedly' };
  });
}

/**
 * Delete a document from SharePoint by driveId and fileId.
 * Skips gracefully if the SharePoint integration is missing or disabled.
 * Treats "not found" as success (already gone).
 */
export async function deleteFromSharePoint(
  driveId: string,
  fileId: string
): Promise<SharePointDeleteResult> {
  try {
    if (!driveId || !fileId) {
      return { success: false, skipped: true };
    }

    // Check integration is configured and enabled
    const { data: connection } = await supabase
      .from('sharepoint_connections')
      .select('id, is_enabled')
      .limit(1)
      .maybeSingle();

    if (!connection || !connection.is_enabled) {
      return { success: false, skipped: true };
    }

    const { data, error } = await supabase.functions.invoke('sharepoint-delete-document', {
      body: { driveId, fileId },
    });

    if (error) {
      console.error('[SharePoint] Delete error:', error);
      return { success: false, error: error.message };
    }

    if (data?.success) {
      return { success: true };
    }

    return { success: false, error: data?.error || 'Unknown error' };
  } catch (error) {
    console.error('[SharePoint] Unexpected delete error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete multiple SharePoint files in parallel. Non-throwing.
 */
export async function deleteMultipleFromSharePoint(
  files: Array<{ driveId: string; fileId: string }>
): Promise<SharePointDeleteResult[]> {
  const results = await Promise.allSettled(
    files.map(f => deleteFromSharePoint(f.driveId, f.fileId))
  );
  return results.map(r =>
    r.status === 'fulfilled' ? r.value : { success: false, error: 'Delete failed unexpectedly' }
  );
}

/**
 * Normalize SharePoint file refs from an invoice row.
 * Handles both the single-file columns (sharepoint_file_id/drive_id)
 * and the merged-invoice JSONB array (sharepoint_files).
 */
export function getSharePointFileRefs(row: {
  sharepoint_file_id?: string | null;
  sharepoint_drive_id?: string | null;
  sharepoint_files?: unknown;
} | null | undefined): Array<{ driveId: string; fileId: string }> {
  const refs: Array<{ driveId: string; fileId: string }> = [];
  if (!row) return refs;
  if (row.sharepoint_file_id && row.sharepoint_drive_id) {
    refs.push({ driveId: row.sharepoint_drive_id, fileId: row.sharepoint_file_id });
  }
  if (Array.isArray(row.sharepoint_files)) {
    for (const f of row.sharepoint_files as any[]) {
      if (f?.driveId && f?.fileId) refs.push({ driveId: f.driveId, fileId: f.fileId });
    }
  }
  return refs;
}
