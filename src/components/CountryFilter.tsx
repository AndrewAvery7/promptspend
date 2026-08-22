/**
 * Narrow a model list to one country, or to several.
 *
 * Every model picker in this app already prints the provider's country next to
 * its flag, which answers "where is this one from?" but not the question people
 * actually arrive with — "show me only the ones from China". Sanctions, data
 * residency, procurement policy and plain curiosity all produce that question,
 * and until now the only way to act on it was to read the flags and tick
 * around them.
 *
 * Selecting nothing means every country. That is the resting state, so the
 * control has to look settled rather than empty when nothing is chosen, which
 * is what the "All" chip is for: it is pressed until a country is, and pressing
 * it again is the way back. The alternative — a "Clear" link that only appears
 * once you are already filtered — leaves the resting state saying nothing at
 * all about what it does.
 *
 * The counts are not decoration. "CN 21" tells you the filter is worth using
 * before you use it, and it is the number of rows you will be left with, so a
 * reader can tell an empty result from a broken one.
 */
import type { CountryCount } from '@/lib/pricing/catalog';
import { Flag, countryName } from './Flag';

interface CountryFilterProps {
  /** Countries present in the catalog, from `Catalog.countries()`. */
  countries: CountryCount[];
  /** Selected ISO-3166 alpha-2 codes. Empty means every country. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Names the group; each picker has its own, so they must not collide. */
  label: string;
}

export function CountryFilter({ countries, selected, onChange, label }: CountryFilterProps) {
  // One country is not a choice, and a row of chips offering it would only take
  // up space. This also keeps the control out of a catalog that has not loaded
  // any providers yet.
  if (countries.length < 2) return null;

  const toggle = (code: string) => {
    onChange(selected.includes(code) ? selected.filter((entry) => entry !== code) : [...selected, code]);
  };

  return (
    <div className="country-filter" role="group" aria-label={label}>
      <span className="country-filter__label" aria-hidden="true">
        Country
      </span>
      <button
        type="button"
        className={`country-toggle country-toggle--all${selected.length === 0 ? ' is-on' : ''}`}
        aria-pressed={selected.length === 0}
        onClick={() => onChange([])}
      >
        All
      </button>
      {countries.map(({ code, count }) => {
        const on = selected.includes(code);
        return (
          <button
            key={code}
            type="button"
            className={`country-toggle${on ? ' is-on' : ''}`}
            aria-pressed={on}
            /* The description, not the name: the code stays the label so what a
               voice-control user says matches what is printed on the chip. */
            title={countryName(code)}
            onClick={() => toggle(code)}
          >
            <Flag country={code} />
            <span>{code}</span>
            <span className="country-toggle__count">
              {count}
              <span className="visually-hidden"> {count === 1 ? 'model' : 'models'}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * How a filtered-to-nothing list should explain itself.
 *
 * Three filters can empty a picker — a search, a country, or both — and "No
 * models match" is only true of the first. A reader who has forgotten a country
 * chip is pressed two panels up needs to be told which control is hiding the
 * rows, otherwise the catalog simply looks short.
 */
export function emptyReason(search: string, countries: string[]): string {
  const where = countries.map(countryName).join(' or ');
  if (search.trim() && countries.length > 0) {
    return `No model from ${where} matches “${search.trim()}”.`;
  }
  if (countries.length > 0) return `No models from ${where}.`;
  if (search.trim()) return `No models match “${search.trim()}”.`;
  return 'No models to show.';
}
