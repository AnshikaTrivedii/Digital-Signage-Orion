const fs = require('fs');

const fixPlaylists = () => {
    let content = fs.readFileSync('apps/web/src/app/playlists/page.tsx', 'utf8');
    content = content.replace('{isBuilderOpen && (\n                    <motion.div \n                        initial={{ opacity: 0 }}', '{isBuilderOpen && (\n                    <motion.div key="builder" \n                        initial={{ opacity: 0 }}');
    content = content.replace('{previewPlaylist && (\n                    <motion.div \n                        initial={{ opacity: 0 }}', '{previewPlaylist && (\n                    <motion.div key="preview" \n                        initial={{ opacity: 0 }}');
    
    // Fallback if previous attempt didn't grab the whitespace right:
    content = content.replace(/\{isBuilderOpen && \(\s*<motion\.div /g, '{isBuilderOpen && (\n                    <motion.div key="builder" ');
    content = content.replace(/\{previewPlaylist && \(\s*<motion\.div /g, '{previewPlaylist && (\n                    <motion.div key="preview" ');
    fs.writeFileSync('apps/web/src/app/playlists/page.tsx', content);
};

const fixAssets = () => {
    let content = fs.readFileSync('apps/web/src/app/assets/page.tsx', 'utf8');
    content = content.replace(/\{isUploadOpen && \(\s*<motion\.div initial=\{\{ opacity: 0 \}\}/g, '{isUploadOpen && (\n                    <motion.div key="upload" initial={{ opacity: 0 }}');
    content = content.replace(/\{selectedAsset && \(\s*<motion\.div initial=\{\{ opacity: 0 \}\}/g, '{selectedAsset && (\n                    <motion.div key="asset-info" initial={{ opacity: 0 }}');
    fs.writeFileSync('apps/web/src/app/assets/page.tsx', content);
};

fixPlaylists();
fixAssets();
console.log("UI Fixed");
