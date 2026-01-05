import Image from 'next/image';

import { ProductContent } from '@/types/product';

type Props = {
  product: ProductContent;
  variant?: 'primary' | 'comparison';
};

const buildFallbackMedia = (product: ProductContent) => {
  const keywords = [product.title, ...product.tags.map((tag) => tag.label)].filter(Boolean).join(',');
  const query = encodeURIComponent(keywords || 'modern gadget');
  return `https://source.unsplash.com/featured/900x600?${query}`;
};

const ProductCard = ({ product, variant = 'primary' }: Props) => {
  const mediaUrl = product.mediaUrl ?? buildFallbackMedia(product);
  return (
    <article className={`product-card product-card--${variant}`} data-testid="product-card" data-variant={variant}>
      <figure className="product-card__media" aria-hidden={!mediaUrl}>
        <Image
          src={mediaUrl}
          alt={`${product.title} hero image`}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1280px) 60vw, 40vw"
          priority={variant === 'primary'}
          className="product-card__image"
          referrerPolicy="no-referrer"
          onError={(event) => {
            const target = event.currentTarget;
            if (target.dataset.fallbackApplied === 'true') return;
            target.dataset.fallbackApplied = 'true';
            target.src = buildFallbackMedia(product);
          }}
        />
      </figure>
      <header>
        <span className="product-card__tag">Fresh Drop</span>
        <h2>{product.title}</h2>
        <p className="subtitle">{product.summary}</p>
      </header>

      <section>
        <h3>What it is</h3>
        <p>{product.whatItIs}</p>
      </section>

      <section>
        <h3>Why it&apos;s useful</h3>
        <p>{product.whyUseful}</p>
      </section>

      <section className="pros-cons">
        <div>
          <h4>Pros</h4>
          <ul>
            {product.pros.map((pro) => (
              <li key={pro}>{pro}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Cons</h4>
          <ul>
            {product.cons.map((con) => (
              <li key={con}>{con}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h3>Price range</h3>
        <p>
          {product.priceRange.currency} {product.priceRange.min} – {product.priceRange.max}
        </p>
      </section>

      <section>
        <h3>Buy links</h3>
        <div className="buy-links">
          {product.buyLinks.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
              <span>{link.label}</span>
              <small>{link.priceHint}</small>
            </a>
          ))}
        </div>
      </section>

      <section className="product-tags">
        {product.tags.map((tag) => (
          <span key={tag.id}>{tag.label}</span>
        ))}
      </section>
    </article>
  );
};

export default ProductCard;
