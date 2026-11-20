// Phuket's three districts, with their official subdistricts and common listing areas.
const catalogue = [
  ['Mueang Phuket district', [
    ['Ao Yon'],
    ['Cape Panwa', 'Panwa'],
    ['Chalong'],
    ['Karon'],
    ['Kata', 'Kata Yai'],
    ['Kata Noi'],
    ['Khao Khad', 'Khao Kad', 'Khao Kat'],
    ['Ko Kaeo', 'Koh Kaew', 'Ko Kaew', 'Koh Kaeo'],
    ['Koh Lon', 'Ko Lon'],
    ['Koh Maphrao', 'Ko Maphrao', 'Coconut Island'],
    ['Makham Bay', 'Ao Makham'],
    ['Nai Harn', 'Nai Han'],
    ['Palai', 'Pa Lai'],
    ['Phuket Old Town', 'Old Phuket Town', 'Old Town'],
    ['Phuket Town', 'Phuket City'],
    ['Rassada', 'Ratsada'],
    ['Rawai'],
    ['Royal Phuket Marina', 'RPM'],
    ['Sai Yuan', 'Saiyuan'],
    ['Saphan Hin'],
    ['Siray', 'Sirey', 'Si Re', 'Sirae'],
    ['Talat Nuea', 'Talad Nuea', 'Talat Nua', 'Talad Nua'],
    ['Talat Yai', 'Talad Yai'],
    ['Wichit', 'Vichit'],
    ['Ya Nui', 'Yanui'],
    ['Boat Lagoon'],
  ]],
  ['Kathu district', [
    ['Kalim'],
    ['Kamala'],
    ['Kathu'],
    ['Nakalay', 'Naka Lay'],
    ['Patong'],
    ['Tri Trang', 'Tritrang'],
  ]],
  ['Thalang district', [
    ['Ao Po', 'Ao Por'],
    ['Baan Don', 'Ban Don'],
    ['Bang Jo'],
    ['Bang Pae'],
    ['Bang Rong'],
    ['Bang Tao', 'Bang Thao'],
    ['Cape Yamu', 'Yamu'],
    ['Cherngtalay', 'Choeng Thale', 'Cherng Talay', 'Chergentalay', 'Cherngtale'],
    ['Laguna'],
    ['Layan'],
    ['Mai Khao', 'Mai Kao'],
    ['Manik'],
    ['Nai Thon', 'Naithon'],
    ['Nai Yang', 'Naiyang'],
    ['Pa Klok', 'Pa Khlok', 'Paklok', 'Pak Khlok'],
    ['Pa Sak', 'Pasak'],
    ['Phru Champa', 'Pru Champa'],
    ['Sakhu', 'Sa Khu'],
    ['Si Sunthon', 'Sri Sunthon', 'Srisoonthorn', 'Sri Sunthorn', 'Si Sunthorn'],
    ['Surin'],
    ['Thalang'],
    ['Thep Krasattri', 'Thep Krasat Tri', 'Thepkasattri', 'Thep Kasattri'],
    ['Tin Lay', 'Tinlay'],
  ]],
];

const collator = new Intl.Collator('en');
const sortAreas = (a, b) => collator.compare(a, b);
const areaKey = value => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const areaNames = new Map(catalogue.flatMap(([, entries]) => entries.map(entry => [entry[0], entry])));
const canonicalNames = new Map([...areaNames].flatMap(([name, aliases]) => aliases.map(alias => [areaKey(alias), name])));
for (const name of areaNames.keys()) canonicalNames.set(areaKey(name), name);

export const canonicalArea = name => canonicalNames.get(areaKey(name)) ?? name;

// Treat a legacy label made entirely of known areas as its first neighborhood.
const areaSeparator = '[^\\p{L}\\p{N}]';
const sortedAliases = [...areaNames.values()].flat().sort((a, b) => b.length - a.length);
const areaAlternatives = sortedAliases.map(alias => alias.split(' ').join(areaSeparator + '*'));
const knownAreaParts = new RegExp(`(^|${areaSeparator})(${areaAlternatives.join('|')})(?=$|${areaSeparator})`, 'giu');

export function areaOption(location) {
  const name = canonicalArea(location.trim());
  if (areaNames.has(name)) return name;
  let firstArea;
  const remainder = name.replace(knownAreaParts, (_, separator, match) => {
    firstArea ??= canonicalArea(match);
    return separator;
  });
  return firstArea && !areaKey(remainder) ? firstArea : name;
}

export function areaOptionKey(location) {
  const name = areaOption(location);
  return areaKey(name) || name;
}

export function areaGroups(locations = []) {
  const groups = catalogue.map(([name, entries]) => [name, entries.map(([area]) => area).sort(sortAreas)]);
  const custom = new Map();
  for (const name of locations.map(areaOption).filter(Boolean).sort(sortAreas)) {
    const key = areaKey(name) || name;
    if (!areaNames.has(name) && !custom.has(key)) custom.set(key, name);
  }
  if (custom.size) groups.push(['Other listed locations', [...custom.values()]]);
  return groups;
}

export function areaSuggestions(locations = []) {
  return areaGroups(locations).flatMap(([, areas]) => areas).sort(sortAreas);
}

// Match whole place names in free-text locations, including names written without spaces.
// Callers supply catalogue names only; stored or URL-supplied custom values use exact matching.
export function areaPattern(names) {
  const aliases = [...new Set(names.flatMap(name => areaNames.get(name) ?? []))];
  if (!aliases.length) return '';
  const alternatives = aliases.map(alias => alias.toLowerCase().split(' ').join('[[:space:][:punct:]]*'));
  return `(^|[^[:alnum:]])(${alternatives.join('|')})($|[^[:alnum:]])`;
}

export const isCatalogueArea = name => areaNames.has(name);
