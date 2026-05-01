"""Document text extraction for all supported file types."""
import base64
import csv
import os
from typing import List, Tuple
from app.core.config import settings


SUPPORTED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/msword": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.ms-excel": "xlsx",
    "text/csv": "csv",
    "text/plain": "txt",
    "image/png": "image",
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/tiff": "image",
    "image/bmp": "image",
    "image/gif": "image",
}

SUPPORTED_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".doc": "docx",
    ".xlsx": "xlsx",
    ".xls": "xlsx",
    ".csv": "csv",
    ".txt": "txt",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".tiff": "image",
    ".bmp": "image",
    ".gif": "image",
}


def detect_file_type(filename: str, content_type: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return (
        SUPPORTED_EXTENSIONS.get(ext)
        or SUPPORTED_TYPES.get(content_type)
        or "unknown"
    )


def extract_text(file_path: str, file_type: str) -> List[Tuple[int, str]]:
    """
    Returns list of (page_number, text) tuples.
    Page numbers are 1-indexed.
    """
    if file_type == "pdf":
        return _extract_pdf(file_path)
    elif file_type == "docx":
        return _extract_docx(file_path)
    elif file_type in ("xlsx", "xls"):
        return _extract_excel(file_path)
    elif file_type == "csv":
        return _extract_csv(file_path)
    elif file_type == "txt":
        return _extract_txt(file_path)
    elif file_type == "image":
        return _extract_image(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_type}")


def _extract_pdf(path: str) -> List[Tuple[int, str]]:
    import fitz  # PyMuPDF
    from PIL import Image

    pages = []
    doc = fitz.open(path)
    for i, page in enumerate(doc, 1):
        text = page.get_text("text").strip()
        if not text:
            text = _ocr_pdf_page(page, Image)
        if text:
            pages.append((i, text))
    doc.close()
    return pages or [(1, "")]


def _extract_docx(path: str) -> List[Tuple[int, str]]:
    import docx

    doc = docx.Document(path)
    # Treat each paragraph group as a pseudo-page (every 30 paragraphs)
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    pages = []
    chunk_size = 30
    for i in range(0, len(paragraphs), chunk_size):
        page_num = i // chunk_size + 1
        text = "\n".join(paragraphs[i: i + chunk_size])
        pages.append((page_num, text))
    return pages or [(1, "")]


def _extract_excel(path: str) -> List[Tuple[int, str]]:
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True)
    pages = []
    for sheet_num, sheet in enumerate(wb.worksheets, 1):
        rows = []
        for row in sheet.iter_rows(values_only=True):
            cells = [str(c) if c is not None else "" for c in row]
            if any(cells):
                rows.append("\t".join(cells))
        if rows:
            pages.append((sheet_num, f"Sheet: {sheet.title}\n" + "\n".join(rows)))
    return pages or [(1, "")]


def _extract_csv(path: str) -> List[Tuple[int, str]]:
    with open(path, "r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f)
        rows = []
        for row in reader:
            cleaned = [cell.strip() for cell in row]
            if any(cleaned):
                rows.append("\t".join(cleaned))
    return [(1, "\n".join(rows))]


def _extract_txt(path: str) -> List[Tuple[int, str]]:
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
    # Split into pseudo-pages of 100 lines
    pages = []
    chunk_size = 100
    for i in range(0, len(lines), chunk_size):
        page_num = i // chunk_size + 1
        text = "".join(lines[i: i + chunk_size]).strip()
        if text:
            pages.append((page_num, text))
    return pages or [(1, "")]


def _extract_image(path: str) -> List[Tuple[int, str]]:
    from PIL import Image

    img = Image.open(path)
    text = _ocr_image(img).strip()
    return [(1, text or "[No readable text found in image]")]


def _ocr_pdf_page(page, image_cls) -> str:
    # OCR is optional in local setups. If Tesseract is unavailable,
    # skip OCR rather than failing the entire upload.
    pix = page.get_pixmap(dpi=200)
    img = image_cls.frombytes("RGB", [pix.width, pix.height], pix.samples)
    return _ocr_image(img).strip()


def _ocr_image(img) -> str:
    try:
        import pytesseract

        return pytesseract.image_to_string(img)
    except Exception:
        return _ocr_image_with_openai(img)


def _ocr_image_with_openai(img) -> str:
    try:
        from io import BytesIO
        from openai import OpenAI

        buffer = BytesIO()
        img.save(buffer, format="PNG")
        image_b64 = base64.b64encode(buffer.getvalue()).decode("ascii")
        client = OpenAI(api_key=settings.openai_api_key)
        response = client.chat.completions.create(
            model=settings.openai_chat_model,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract all visible text from the image. "
                        "Return only the transcription, with line breaks preserved."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Transcribe the image exactly."},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_b64}"
                            },
                        },
                    ],
                },
            ],
            temperature=0,
            max_tokens=2048,
        )
        message = response.choices[0].message.content or ""
        return message.strip()
    except Exception:
        return ""
