import { ProductContent } from '@/types/product';
import { nanoid } from 'nanoid';

const isoNow = () => new Date().toISOString();

export const staticProducts: ProductContent[] = [
  {
    id: `aurora-light-${nanoid(6)}`,
    title: 'Aurora Smart Mood Light',
    summary: 'Immersive, app-controlled LED panels for adaptive ambiance.',
    whatItIs: 'Modular RGBIC light panels with Wi-Fi + Matter support.',
    whyUseful: 'Transforms rooms into focused workspaces or calm retreats with guided scenes.',
    priceRange: { min: 189, max: 239, currency: 'USD' },
    pros: ['Matter + HomeKit ready', 'Energy-aware automation', 'Community scene marketplace'],
    cons: ['Requires wall mounting', 'Full brightness limited to 2 hours for longevity'],
    tags: [
      { id: 'smart-home', label: 'Smart Home' },
      { id: 'lighting', label: 'Lighting' },
      { id: 'mood', label: 'Mood Boost' },
    ],
    buyLinks: [
      {
        label: 'Aurora Store',
        url: 'https://example.com/aurora',
        priceHint: '$199 bundle',
        trusted: true,
      },
      {
        label: 'Amazon',
        url: 'https://amazon.com/dp/aurora-light',
        priceHint: '$219 Prime',
        trusted: false,
      },
    ],
    mediaUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee',
    noveltyScore: 0.64,
    generatedAt: isoNow(),
    source: 'ai',
  },
  {
    id: `brew-sync-${nanoid(6)}`,
    title: 'BrewSync Mini Barista',
    summary: 'Countertop espresso maker with bean telemetry and wellness nudges.',
    whatItIs: 'Compact dual-boiler espresso station with hydration reminders.',
    whyUseful: 'Pairs your caffeine routine with hydration + mindfulness balancing.',
    priceRange: { min: 329, max: 389, currency: 'USD' },
    pros: ['Auto-dials grind size', 'Detachable pour-over module', 'Barista-grade steam'],
    cons: ['Needs water filter swaps monthly', 'No cold brew mode yet'],
    tags: [
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'coffee', label: 'Coffee' },
      { id: 'wellness', label: 'Wellness' },
    ],
    buyLinks: [
      {
        label: 'BrewSync Official',
        url: 'https://example.com/brewsync',
        priceHint: '$359 launch price',
        trusted: true,
      },
    ],
    mediaUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93',
    noveltyScore: 0.71,
    generatedAt: isoNow(),
    source: 'ai',
  },
  {
    id: `tempo-run-${nanoid(6)}`,
    title: 'TempoRun Heads-Up Coach',
    summary: 'AR running glasses layering pace cues, weather, and playlist sync.',
    whatItIs: 'Featherweight AR eyewear tuned for runners with adaptive UI.',
    whyUseful: 'Keeps attention on the route while surfacing just-in-time coaching.',
    priceRange: { min: 249, max: 299, currency: 'USD' },
    pros: ['9-hour battery', 'Audio transparency', 'Weather map overlay'],
    cons: ['Requires companion app', 'Prescription lenses extra'],
    tags: [
      { id: 'fitness', label: 'Fitness' },
      { id: 'wearables', label: 'Wearables' },
      { id: 'ar', label: 'Augmented Reality' },
    ],
    buyLinks: [
      {
        label: 'TempoRun',
        url: 'https://example.com/temporun',
        priceHint: '$279 preorder',
        trusted: true,
      },
    ],
    mediaUrl: 'https://images.unsplash.com/photo-1489515217757-5fd1be406fef',
    noveltyScore: 0.58,
    generatedAt: isoNow(),
    source: 'ai',
  },
];
