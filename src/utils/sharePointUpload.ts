import { supabase } from "@/integrations/supabase/client";

export interface SharePointUploadResult {
  success: boolean;
  fileUrl?: string;
  fileId?: string;
  error?: string;
  skipped?: boolean; // True if no SharePoint config exists
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
        fileId: data.fileId
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
