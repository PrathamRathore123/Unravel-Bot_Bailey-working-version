# Google Drive PDF Links Configuration

## Overview
The bot now sends Google Drive links for PDF brochures instead of uploading local files. This is much faster and more reliable.

## Configuration

Add the following environment variables to your `.env` file:

```env
# Google Drive PDF Links
LONDON_CHRISTMAS_PDF_LINK=https://drive.google.com/file/d/YOUR_LONDON_CHRISTMAS_PDF_ID/view?usp=sharing
NEWYORK_CHRISTMAS_PDF_LINK=https://drive.google.com/file/d/YOUR_NEWYORK_CHRISTMAS_PDF_ID/view?usp=sharing
PARIS_NOEL_PDF_LINK=https://drive.google.com/file/d/YOUR_PARIS_NOEL_PDF_ID/view?usp=sharing
SANTA_WEEK_PDF_LINK=https://drive.google.com/file/d/YOUR_SANTA_WEEK_PDF_ID/view?usp=sharing
```

## How to Get Google Drive Share Links

1. Upload your PDF files to Google Drive
2. Right-click on each PDF file
3. Select "Share" → "Get link"
4. Under "General access", select "Anyone with the link"
5. Copy the sharing link
6. Add the links to your `.env` file as shown above

## Benefits

- **Faster delivery**: Links are sent instantly vs uploading large files
- **More reliable**: No file size limitations
- **Better tracking**: You can see when users access the brochures
- **Easy updates**: Update links in .env file without touching code
- **Secure**: Links are stored in environment variables

## Bot Behavior

When users select a package, they will now receive:
- Package overview message
- Google Drive download link for the PDF brochure
- Call to action to proceed with booking

The bot will automatically use the links from the environment variables.
