import { differenceInDays, parseISO, startOfToday } from 'date-fns';
import { ExpiryStyle } from '../types';

export function daysLeft(expiryDate: string): number {
  return differenceInDays(parseISO(expiryDate), startOfToday());
}

export function getExpiryStyle(days: number): ExpiryStyle {
  if (days < 0)  return { bg: '#F7C1C1', border: '#E24B4A', text: '#791F1F', band: 'expired' };
  if (days === 0) return { bg: '#F5C4B3', border: '#D85A30', text: '#712B13', band: 'today' };
  if (days <= 2)  return { bg: '#F5C4B3', border: '#D85A30', text: '#712B13', band: 'soon' };
  if (days <= 6)  return { bg: '#FAC775', border: '#BA7517', text: '#633806', band: 'soon' };
  return { bg: '#9FE1CB', border: '#1D9E75', text: '#085041', band: 'fresh' };
}

export function getBubbleSize(days: number): number {
  if (days < 0)   return 66;
  if (days <= 2)  return 64;
  if (days <= 6)  return 72;
  return 80;
}

export function dayLabel(days: number): string {
  if (days < 0)    return 'expired';
  if (days === 0)  return 'today!';
  if (days === 1)  return '1 day';
  return `${days} days`;
}

export function urgency(days: number): number {
  if (days < 0)   return 1;
  if (days <= 2)  return 0.85;
  if (days <= 6)  return 0.5;
  return 0.1;
}
