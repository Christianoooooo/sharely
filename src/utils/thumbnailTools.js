const { execFile } = require('child_process');

// gs/ffmpeg parse untrusted uploads; start them with an empty environment so an
// exploit in either cannot read SESSION_SECRET, MONGODB_URI or SMTP credentials.
const TOOL_ENV = { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' };

function renderVideo(inputPath, outputPath) {
  return new Promise((resolve) => {
    execFile('ffmpeg', [
      '-y', '-i', inputPath,
      '-ss', '00:00:01',
      '-vframes', '1',
      '-vf', 'scale=320:320:force_original_aspect_ratio=increase,crop=320:320',
      '-q:v', '3',
      outputPath,
    ], { timeout: 30000, env: TOOL_ENV }, (err) => resolve(!err));
  });
}

function renderPdf(inputPath, outputPath) {
  return new Promise((resolve) => {
    execFile('gs', [
      '-dNOPAUSE', '-dBATCH', '-dSAFER',
      '-sDEVICE=jpeg',
      '-dFirstPage=1', '-dLastPage=1',
      '-r72', '-dJPEGQ=85',
      `-sOutputFile=${outputPath}`,
      inputPath,
    ], { timeout: 30000, env: TOOL_ENV }, (err) => resolve(!err));
  });
}

/**
 * Maps a MIME type to the thumbnail renderer that handles it.
 * @param {string} mimeType - Normalized MIME type.
 * @returns {'video'|'pdf'|null} null if no thumbnail is generated for this type.
 */
function thumbnailKind(mimeType) {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  return null;
}

/**
 * Renders a JPEG thumbnail with ffmpeg (video) or ghostscript (PDF) in this process' container.
 * @param {string} inputPath - Plaintext source file.
 * @param {'video'|'pdf'} kind - Result of thumbnailKind().
 * @param {string} outputPath - JPEG target; may be left partially written on failure.
 * @returns {Promise<boolean>} true on success; never rejects.
 */
function renderThumbnail(inputPath, kind, outputPath) {
  return kind === 'video' ? renderVideo(inputPath, outputPath) : renderPdf(inputPath, outputPath);
}

module.exports = { thumbnailKind, renderThumbnail };
