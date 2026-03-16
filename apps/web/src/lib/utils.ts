import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { API_URL } from '@/config';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getMediaUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  if (url.startsWith('/static')) {
      return `${API_URL}${url}`;
  }
  return url;
}
