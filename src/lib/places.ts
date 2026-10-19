import { City, Country, State } from "country-state-city";

export type PlaceOption = { value: string; label: string };

export const COUNTRY_OPTIONS: PlaceOption[] = Country.getAllCountries()
  .map((country) => ({ value: country.isoCode, label: country.name }))
  .sort((a, b) => a.label.localeCompare(b.label));

export function countryName(iso: string): string {
  return Country.getCountryByCode(iso)?.name ?? iso;
}

export function regionOptions(countryIso: string): PlaceOption[] {
  const states = State.getStatesOfCountry(countryIso);
  if (states.length === 0) {
    const name = countryName(countryIso);
    return name ? [{ value: name, label: name }] : [];
  }
  return states
    .map((state) => ({ value: state.isoCode, label: state.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function regionName(countryIso: string, regionValue: string): string {
  const match = State.getStatesOfCountry(countryIso).find(
    (state) =>
      state.isoCode === regionValue ||
      state.name.toLowerCase() === regionValue.trim().toLowerCase(),
  );
  return match?.name ?? regionValue;
}

function resolveStateCode(countryIso: string, regionValue: string): string {
  const needle = regionValue.trim().toLowerCase();
  if (!needle) return "";
  const states = State.getStatesOfCountry(countryIso);
  const match = states.find(
    (state) =>
      state.isoCode.toLowerCase() === needle ||
      state.name.toLowerCase() === needle,
  );
  return match?.isoCode ?? regionValue;
}

export function cityOptions(countryIso: string, regionValue: string): PlaceOption[] {
  if (!regionValue) return [];
  const states = State.getStatesOfCountry(countryIso);
  const stateCode = resolveStateCode(countryIso, regionValue);
  const cities =
    states.length > 0
      ? City.getCitiesOfState(countryIso, stateCode)
      : (City.getCitiesOfCountry(countryIso) ?? []);
  const seen = new Set<string>();
  const options: PlaceOption[] = [];
  for (const city of cities) {
    const name = city.name?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    options.push({ value: name, label: name });
  }
  options.sort((a, b) => a.label.localeCompare(b.label));
  return options;
}

export function matchRegion(countryIso: string, stateName: string): string {
  const needle = stateName.trim().toLowerCase();
  if (!needle) return "";
  const states = State.getStatesOfCountry(countryIso);
  const match = states.find(
    (state) =>
      state.name.toLowerCase() === needle ||
      state.isoCode.toLowerCase() === needle,
  );
  if (match) return match.isoCode;
  if (states.length === 0) return countryName(countryIso);
  return "";
}
