import { createRoot } from 'react-dom/client';
import { SupportDocument } from './SupportDocument';
import { SupportDocumentData } from '@/lib/supportDocumentGenerator';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Renders the SupportDocument component to a hidden container and generates a PDF.
 * This ensures the PDF matches exactly what users see in the browser.
 */
export async function renderSupportDocumentToPdf(data: SupportDocumentData): Promise<string> {
  // Create a hidden container
  const container = document.createElement('div');
  container.id = 'pdf-render-container';
  container.style.cssText = `
    position: fixed;
    left: -10000px;
    top: 0;
    width: 1200px;
    background: white;
    padding: 20px;
    z-index: -9999;
  `;
  document.body.appendChild(container);

  try {
    // Create a wrapper div for the component
    const wrapper = document.createElement('div');
    wrapper.id = 'support-document-render';
    container.appendChild(wrapper);

    // Render the React component
    const root = createRoot(wrapper);
    
    await new Promise<void>((resolve) => {
      root.render(<SupportDocument data={data} />);
      // Wait for render to complete
      setTimeout(resolve, 300);
    });

    // Find the rendered content
    const element = wrapper.querySelector('#support-document') || wrapper;

    // Capture with html2canvas
    const canvas = await html2canvas(element as HTMLElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
    });

    // Calculate PDF dimensions
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    // Add additional pages if content is taller than one page
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Cleanup React root
    root.unmount();

    // Convert to base64
    const pdfBase64 = pdf.output('datauristring').split(',')[1];
    return pdfBase64;
  } finally {
    // Clean up container
    document.body.removeChild(container);
  }
}

/**
 * Batch render multiple support documents to PDFs
 */
export async function renderMultipleSupportDocumentsToPdf(
  documents: Array<{ contractName?: string; data: SupportDocumentData }>
): Promise<Array<{ contractName?: string; pdfBase64: string }>> {
  const results: Array<{ contractName?: string; pdfBase64: string }> = [];

  for (const doc of documents) {
    try {
      const pdfBase64 = await renderSupportDocumentToPdf(doc.data);
      results.push({
        contractName: doc.contractName,
        pdfBase64,
      });
    } catch (error) {
      console.error('Error generating PDF for', doc.contractName, error);
      // Continue with other documents
    }
  }

  return results;
}
