import { createContext, useContext, useMemo } from "react";
import { PRODUCTS as STATIC_PRODUCTS } from "../data/constants";

const ProductsContext = createContext(null);

/**
 * Provides dynamic products derived from the catalog state.
 * Wraps the entire app so every component can read the live product list.
 */
export function ProductsProvider({ catalog, children }) {
  const value = useMemo(() => {
    const products = (catalog && catalog.length > 0)
      ? catalog.map(p => ({
          id: p.id,
          name: p.name,
          desc: p.desc || "",
          color: p.color || "#64748B",
          bg: p.bg || "#F8FAFC",
          text: p.text || p.color || "#64748B",
        }))
      : STATIC_PRODUCTS;

    const prodMap = Object.fromEntries(products.map(p => [p.id, p]));
    return { products, prodMap };
  }, [catalog]);

  return (
    <ProductsContext.Provider value={value}>
      {children}
    </ProductsContext.Provider>
  );
}

/**
 * Hook to consume dynamic products anywhere in the component tree.
 * Returns { products, prodMap } — drop-in replacement for the static constants.
 */
export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) {
    // Fallback if used outside provider (shouldn't happen in normal flow)
    return {
      products: STATIC_PRODUCTS,
      prodMap: Object.fromEntries(STATIC_PRODUCTS.map(p => [p.id, p])),
    };
  }
  return ctx;
}
