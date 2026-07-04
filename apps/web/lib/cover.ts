interface ImageLike {
  id: string;
  filename: string;
  fileType: string;
}

const PREFERENCE = ["front", "cover", "folder", "booklet"];

/** Pick the best cover image file id from a directory's files, or null. */
export function pickCover(files: ImageLike[]): string | null {
  const images = files.filter((f) => f.fileType === "IMAGE");
  if (images.length === 0) return null;
  for (const pref of PREFERENCE) {
    const hit = images.find((f) => f.filename.toLowerCase().includes(pref));
    if (hit) return hit.id;
  }
  return images[0]!.id;
}
