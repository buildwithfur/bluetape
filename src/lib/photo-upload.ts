import type { Id } from '@convex/_generated/dataModel'
import { createPhotoThumbnail } from '@/lib/image'

export interface UploadedPhoto {
  storageId: Id<'_storage'>
  thumbnailStorageId?: Id<'_storage'>
}

export type GenerateUploadUrl = () => Promise<string>

/**
 * Canonical upload path for user-provided photos.
 *
 * The original is always stored for full-size views. A resized JPEG derivative
 * is stored when the browser can decode and upload it; callers can safely use
 * the original as the catalog fallback when the derivative is unavailable.
 */
export async function uploadPhotoWithThumbnail(
  file: File,
  generateUploadUrl: GenerateUploadUrl,
  uploadFailedMessage = 'Photo upload failed',
): Promise<UploadedPhoto> {
  // Start decoding while the original is uploading so large camera photos do
  // not pay both operations serially.
  const thumbnailPromise = createPhotoThumbnail(file).catch(() => null)
  const storageId = await uploadBlob(file, file.type, generateUploadUrl, uploadFailedMessage)
  const thumbnail = await thumbnailPromise

  if (!thumbnail) return { storageId }

  try {
    const thumbnailStorageId = await uploadBlob(
      thumbnail,
      'image/jpeg',
      generateUploadUrl,
      uploadFailedMessage,
    )
    return { storageId, thumbnailStorageId }
  } catch {
    // A derivative is an optimization. Preserve the original upload if the
    // optional thumbnail upload fails.
    return { storageId }
  }
}

async function uploadBlob(
  blob: Blob,
  contentType: string,
  generateUploadUrl: GenerateUploadUrl,
  uploadFailedMessage: string,
): Promise<Id<'_storage'>> {
  const postUrl = await generateUploadUrl()
  const response = await fetch(postUrl, {
    method: 'POST',
    headers: contentType ? { 'Content-Type': contentType } : undefined,
    body: blob,
  })
  if (!response.ok) throw new Error(uploadFailedMessage)
  const { storageId } = (await response.json()) as { storageId: Id<'_storage'> }
  return storageId
}
