import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { SupportDocumentData } from './supportDocumentGenerator';

/**
 * Generate a PDF from the SupportDocument component by rendering it to a hidden container,
 * capturing it with html2canvas, and converting to PDF.
 * Returns the PDF as a base64 string for sending to the Edge Function.
 */
export async function generateSupportDocumentPdf(
  data: SupportDocumentData,
  renderComponent: (container: HTMLElement) => void
): Promise<string> {
  // Create a hidden container for rendering
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '1200px'; // Fixed width for consistent rendering
  container.style.background = 'white';
  container.style.padding = '20px';
  document.body.appendChild(container);

  try {
    // Render the component into the container
    renderComponent(container);

    // Wait for fonts and images to load
    await new Promise(resolve => setTimeout(resolve, 100));

    // Capture the container with html2canvas
    const canvas = await html2canvas(container, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
    });

    // Calculate PDF dimensions (A4 aspect ratio)
    const imgWidth = 210; // A4 width in mm
    const pageHeight = 297; // A4 height in mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    // Create PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    // Add image to PDF, handling multi-page if needed
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // Convert to base64
    const pdfBase64 = pdf.output('datauristring').split(',')[1];
    return pdfBase64;
  } finally {
    // Clean up
    document.body.removeChild(container);
  }
}

/**
 * Render a simple PDF from support document data for preview/download
 */
export function downloadSupportDocumentPdf(elementId: string, filename: string): void {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Element not found for PDF export');
    return;
  }

  html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  }).then(canvas => {
    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const pdf = new jsPDF('p', 'mm', 'a4');
    let heightLeft = imgHeight;
    let position = 0;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(filename);
  });
}

/**
 * Generate PDF from an existing element on the page
 */
export async function generatePdfFromElement(elementId: string): Promise<string> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error('Element not found for PDF generation');
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgWidth = 210;
  const pageHeight = 297;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const pdf = new jsPDF('p', 'mm', 'a4');
  let heightLeft = imgHeight;
  let position = 0;

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  const pdfBase64 = pdf.output('datauristring').split(',')[1];
  return pdfBase64;
}
