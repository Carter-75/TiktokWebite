import { ProductContent } from '@/types/product';

type Props = {
  product: ProductContent;
};

const ProductCard = ({ product }: Props) => (
  <article className="product-card" data-testid="product-card">
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

export default ProductCard;
