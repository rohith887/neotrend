/**
 * Country display helpers — one shared source of truth for Agent, Counselor,
 * and Supervisor surfaces so the same country always renders the same flag.
 *
 * A country value may arrive as:
 *   - a plain name string        (e.g. "UAE", "United States", "Canada")
 *   - an object with `code` and `name`
 *   - an object with only `name`
 *
 * The flag is resolved from the ISO-2 `code` when present, otherwise from the
 * parsed name via a NAME -> CODE alias map. Unknown countries render the name
 * with no flag.
 *
 * Rendering uses FlagCDN flag IMAGES (https://flagcdn.com) by default because
 * many environments (notably Windows) do not render regional-indicator emoji
 * as flag glyphs — they show the raw letters (e.g. "AE" instead of 🇦🇪). A
 * small inline <img> guarantees a real, visible flag. If the image cannot
 * load, we fall back to the emoji, then to the plain name.
 */

import { useEffect, useState } from 'react';

// Required minimum set (per brief) plus a wider common list.
const NAME_TO_CODE = {
  // Canonical study destinations (matches server Country seed).
  'UAE': 'AE', 'United Arab Emirates': 'AE', 'Emirates': 'AE',
  'Canada': 'CA', 'United States': 'US', 'United States of America': 'US', 'USA': 'US', 'America': 'US',
  'United Kingdom': 'GB', 'UK': 'GB', 'Britain': 'GB', 'England': 'GB',
  'Australia': 'AU', 'Germany': 'DE', 'Ireland': 'IE', 'New Zealand': 'NZ', 'Singapore': 'SG',
  // Required wider set.
  'India': 'IN', 'France': 'FR',
  // Additional common destinations.
  'China': 'CN', 'Japan': 'JP', 'South Korea': 'KR', 'Korea': 'KR',
  'Italy': 'IT', 'Spain': 'ES', 'Netherlands': 'NL', 'Holland': 'NL',
  'Sweden': 'SE', 'Norway': 'NO', 'Denmark': 'DK', 'Finland': 'FI', 'Switzerland': 'CH',
  'Austria': 'AT', 'Belgium': 'BE', 'Poland': 'PL', 'Portugal': 'PT', 'Greece': 'GR',
  'Czech Republic': 'CZ', 'Czechia': 'CZ', 'Hungary': 'HU', 'Turkey': 'TR', 'Türkiye': 'TR',
  'Malaysia': 'MY', 'Thailand': 'TH', 'Vietnam': 'VN', 'Philippines': 'PH', 'Indonesia': 'ID',
  'Hong Kong': 'HK', 'Macau': 'MO', 'Taiwan': 'TW', 'Sri Lanka': 'LK', 'Bangladesh': 'BD',
  'Pakistan': 'PK', 'Nepal': 'NP', 'Afghanistan': 'AF', 'Saudi Arabia': 'SA', 'Qatar': 'QA',
  'Kuwait': 'KW', 'Oman': 'OM', 'Bahrain': 'BH', 'Jordan': 'JO', 'Israel': 'IL',
  'Egypt': 'EG', 'South Africa': 'ZA', 'Nigeria': 'NG', 'Kenya': 'KE', 'Ethiopia': 'ET',
  'Ghana': 'GH', 'Brazil': 'BR', 'Argentina': 'AR', 'Mexico': 'MX', 'Colombia': 'CO',
  'Chile': 'CL', 'Peru': 'PE', 'Fiji': 'FJ', 'Mauritius': 'MU', 'Cyprus': 'CY',
  'Luxembourg': 'LU', 'Malta': 'MT', 'Iceland': 'IS', 'Russia': 'RU', 'Ukraine': 'UA',
};

// ISO-3166 alpha-2 -> regional-indicator flag emoji (fallback rendering).
const codeToFlag = (code) => {
  if (!code || typeof code !== 'string') return null;
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return null;
  const chCode = (s) => 0x1f1e6 + (s.charCodeAt(0) - 65);
  return String.fromCodePoint(chCode(cc[0]), chCode(cc[1]));
};

const normalizeName = (name) => String(name || '').trim();

const normalize = (name) => normalizeName(name).toLowerCase().replace(/[^a-z]/g, ' ').replace(/\s+/g, ' ');

const codeFor = (name) => {
  const key = normalize(name);
  if (NAME_TO_CODE[normalizeName(name)]) return NAME_TO_CODE[normalizeName(name)];
  const found = Object.entries(NAME_TO_CODE).find(([k]) => normalize(k) === key);
  return found ? found[1] : null;
};

/**
 * Normalize a country value to a display name string.
 * Accepts a string or an object shaped like { name, code }.
 */
export const countryName = (value) => {
  if (!value) return '';
  if (typeof value === 'object') {
    return normalizeName(value.name || value.label) || normalizeName(value.code);
  }
  return normalizeName(value);
};

/**
 * Resolve a country value to its ISO-3166 alpha-2 code (or null when unknown).
 * Uses the `code` when present on an object, else falls back to the name map.
 */
export const countryCode = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.code === 'string') {
    const c = value.code.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(c)) return c;
  }
  const name = countryName(value);
  if (!name) return null;
  return codeFor(name);
};

/**
 * Resolve a country value to its flag emoji (or null when unknown/unsupported).
 * This is a fallback glyph — prefer the FlagCDN image rendering.
 */
export const countryFlag = (value) => {
  const code = countryCode(value);
  return codeToFlag(code);
};

/**
 * Resolve a country value to a FlagCDN flag image URL (or null when unknown).
 */
export const countryFlagURL = (value) => {
  const code = countryCode(value);
  if (!code) return null;
  return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
};

/**
 * Render a small inline country flag IMAGE before the country name.
 * Falls back to the emoji if the image fails to load, then to the name alone.
 */
export const CountryLabel = ({ value, fallback = '—', sx = {}, flagSx = {}, component: C = 'span' }) => {
  const name = countryName(value);
  const flagURL = countryFlagURL(value);
  const emoji = countryFlag(value);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [flagURL]);

  if (!name) return <C>{fallback}</C>;

  const showImg = flagURL && !imgFailed;
  const showEmoji = flagURL && imgFailed && emoji;

  return (
    <C style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', ...sx }}>
      {showImg && (
        <img
          src={flagURL}
          alt=""
          aria-hidden="true"
          onError={() => setImgFailed(true)}
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            flexShrink: 0,
            objectFit: 'cover',
            verticalAlign: 'middle',
            ...flagSx,
          }}
        />
      )}
      {showEmoji && <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, ...flagSx }}>{emoji}</span>}
      <span style={{ lineHeight: 1.15 }}>{name}</span>
    </C>
  );
};

export default countryFlag;