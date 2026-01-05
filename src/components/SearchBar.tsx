'use client';

import { FormEvent, useState } from 'react';

type Props = {
  onSearch: (value: string) => void;
};

const SearchBar = ({ onSearch }: Props) => {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(value.trim());
  };

  return (
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
  );
};

export default SearchBar;
