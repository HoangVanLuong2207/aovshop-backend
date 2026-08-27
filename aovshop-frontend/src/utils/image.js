export const getImageUrl = (path) => {
    if (!path) return 'https://via.placeholder.com/400x300?text=No+Image';
    if (path.startsWith('http')) return path;
    // Fallback to local upload path
    return `http://localhost:3000/uploads/${path}`;
};

export const isDirectLink = (url) => {
    if (!url) return false;
    // Kiểm tra định dạng ảnh chuẩn
    if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(url.split('?')[0])) return true;
    // Kiểm tra link Google Drive direct (uc)
    if (url.includes('drive.google.com/uc')) return true;
    return false;
};

export const convertDriveLink = (url) => {
    if (!url) return '';
    if (url.includes('drive.google.com/file/d/')) {
        const id = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
        if (id) {
            return `https://drive.google.com/uc?export=view&id=${id}`;
        }
    }
    return url;
};
