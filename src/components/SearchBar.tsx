'use client';

import { FormEvent, useState } from 'react';

type Props = {
  onSearch: (value: string) => void;
  activeQuery?: string;
  onClear?: () => void;
};

const SearchBar = ({ onSearch, activeQuery, onClear }: Props) => {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(value.trim());
  };

  return (
    <div className="search-bar__container">
      <form className="search-bar" onSubmit={handleSubmit}>
        <input
          type="search"
          placeholder="Search for a vibe, need, or keyword"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Search for products"
        />
        <button type="submit" className="button is-primary">
          Search
        </button>
      </form>
      {activeQuery && (
        <div className="search-bar__active" role="status" aria-live="polite">
          <span>Active search: {activeQuery}</span>
          {onClear && (
            <button type="button" className="button is-text" onClick={onClear}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
