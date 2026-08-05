import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractTextFromPdf(file, onProgress = () => {}) {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data });
  const pages = [];

  try {
    const pdf = await loadingTask.promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress({ current: pageNumber, total: pdf.numPages });

      const page = await pdf.getPage(pageNumber);

      try {
        const content = await page.getTextContent();
        pages.push(itemsToLines(content.items));
      } finally {
        if (typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }
    }

    const text = pages.join('\n\n');

    if (text.trim().length < 100) {
      throw new Error(
        'O PDF não possui texto selecionável suficiente. Ele provavelmente foi digitalizado como imagem e precisa de OCR.',
      );
    }

    return text;
  } finally {
    // Nas versões atuais do PDF.js, destroy() pertence ao loadingTask
    // retornado por getDocument(), e não ao PDFDocumentProxy.
    if (typeof loadingTask.destroy === 'function') {
      try {
        await loadingTask.destroy();
      } catch (cleanupError) {
        // Uma falha de limpeza não deve invalidar um relatório já extraído.
        console.warn('Não foi possível finalizar o worker do PDF.js:', cleanupError);
      }
    }
  }
}

function itemsToLines(items) {
  const textItems = items
    .filter((item) => typeof item.str === 'string' && item.str.trim())
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform?.[4] ?? 0,
      y: item.transform?.[5] ?? 0,
      width: item.width ?? 0,
    }))
    .sort((a, b) => {
      const yDifference = b.y - a.y;
      if (Math.abs(yDifference) > 2.2) return yDifference;
      return a.x - b.x;
    });

  const lines = [];
  let currentLine = null;

  for (const item of textItems) {
    if (!currentLine || Math.abs(currentLine.y - item.y) > 2.2) {
      currentLine = { y: item.y, items: [item] };
      lines.push(currentLine);
    } else {
      currentLine.items.push(item);
    }
  }

  return lines
    .map((line) => line.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean)
    .join('\n');
}
