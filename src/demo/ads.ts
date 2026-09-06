export interface SponsorConfig {
  name: string;
  headline: string;
  media?: string;
  mediaType?: 'image' | 'video';
  clickUrl?: string;
  audio?: string;
  skipAds?: boolean;
}

export interface AdCreative {
  id: string;
  sponsor: string;
  kicker: string;
  headline: string;
  support: string;
  media: string;
  mediaType: 'image' | 'video';
  copySide: 'left' | 'right';
  duration: number;
  clickUrl?: string;
  audio?: string;
}

const suppliedPoster = '/ads/ralph-lauren.png';

export const demoAdPod: AdCreative[] = [
  {
    id: 'ralph-lauren',
    sponsor: 'RALPH LAUREN',
    kicker: 'Ralph Lauren Collection',
    headline: 'Classic layers. Modern character.',
    support: 'Presented during the CourtOS changeover.',
    media: '/ads/ralph-lauren.png',
    mediaType: 'image',
    copySide: 'left',
    duration: 30,
  },
  {
    id: 'rolex',
    sponsor: 'ROLEX',
    kicker: 'Rolex End-Defender',
    headline: 'Precision keeps play on time.',
    support: 'Presented during the CourtOS changeover.',
    media: '/ads/rolex.png',
    mediaType: 'image',
    copySide: 'right',
    duration: 30,
  },
  {
    id: 'coca-cola',
    sponsor: 'COCA-COLA',
    kicker: 'Together',
    headline: 'Refresh before the next set.',
    support: 'Presented during the CourtOS changeover.',
    media: '/ads/coca-cola.png',
    mediaType: 'image',
    copySide: 'left',
    duration: 30,
  },
];

export function preloadDemoAssets() {
  if (typeof window === 'undefined') return;
  for (const media of new Set(demoAdPod.map(ad => ad.media))) {
    const image = new Image(); image.decoding = 'async'; image.src = media;
  }
}

export function getAdPod(sponsor: SponsorConfig, preview = false): AdCreative[] {
  if (!sponsor.media && !preview) return demoAdPod;
  return [{
    id: preview ? 'preview-creative' : 'custom-creative',
    sponsor: sponsor.name || 'COURTSIDE CLUB',
    kicker: 'Changeover partner',
    headline: sponsor.headline || 'Your next set starts here.',
    support: 'A sponsor message, shown with the return-to-court clock.',
    media: sponsor.media || suppliedPoster,
    mediaType: sponsor.mediaType || 'image',
    copySide: 'left',
    duration: 90,
    clickUrl: sponsor.clickUrl,
    audio: sponsor.audio,
  }];
}

export function selectAd(pod: AdCreative[], remaining: number, breakLength: number) {
  const elapsed = Math.max(0, breakLength - remaining);
  let cursor = 0;
  for (let index = 0; index < pod.length; index++) {
    const ad = pod[index];
    if (elapsed < cursor + ad.duration || index === pod.length - 1) {
      return { ad, index, elapsedInAd: Math.max(0, elapsed - cursor) };
    }
    cursor += ad.duration;
  }
  return { ad: pod[0], index: 0, elapsedInAd: 0 };
}
