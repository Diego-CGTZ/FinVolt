import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Category, CreateCategoryInput, UpdateCategoryInput } from '../../domain/models/Category';
import { SupabaseCategoryRepository } from '../../infrastructure/database/SupabaseCategoryRepository';
import { useAuth } from './AuthContext';

type CategoriesState = {
  /** Todas las categorías visibles (sistema + propias). */
  categories: Category[];
  /** Solo categorías activas. Útil para selectores en formularios. */
  activeCategories: Category[];
  isLoading: boolean;
  error: string | null;
  loadCategories: () => Promise<void>;
  createCategory: (input: CreateCategoryInput) => Promise<void>;
  updateCategory: (id: string, input: UpdateCategoryInput) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
};

const CategoriesContext = createContext<CategoriesState | null>(null);

const repository = new SupabaseCategoryRepository();

export const CategoriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derivado: solo activas ─────────────────────────────────────────────────
  const activeCategories = categories.filter((c) => c.isActive);

  // ── Carga ─────────────────────────────────────────────────────────────────
  const loadCategories = useCallback(async () => {
    if (authState.status !== 'authenticated') return;

    setIsLoading(true);
    setError(null);
    try {
      const data = await repository.getCategories();
      setCategories(data);
    } catch (err: any) {
      setError(err.message || 'Error loading categories');
    } finally {
      setIsLoading(false);
    }
  }, [authState.status]);

  // ── Mutaciones ────────────────────────────────────────────────────────────
  const createCategory = async (input: CreateCategoryInput) => {
    try {
      const newCategory = await repository.createCategory(input);
      setCategories((prev) => [...prev, newCategory].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err: any) {
      setError(err.message || 'Error creating category');
      throw err;
    }
  };

  const updateCategory = async (id: string, input: UpdateCategoryInput) => {
    try {
      const updated = await repository.updateCategory(id, input);
      setCategories((prev) =>
        prev.map((c) => (c.id === id ? updated : c)).sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch (err: any) {
      setError(err.message || 'Error updating category');
      throw err;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      await repository.deleteCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      setError(err.message || 'Error deleting category');
      throw err;
    }
  };

  // ── Auto-load al autenticarse ──────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    if (authState.status === 'authenticated') {
      repository
        .getCategories()
        .then((data) => {
          if (mounted) setCategories(data);
        })
        .catch((err) => {
          if (mounted) setError(err.message || 'Error loading categories');
        });
    }
    return () => {
      mounted = false;
    };
  }, [authState.status]);

  return (
    <CategoriesContext.Provider
      value={{
        categories,
        activeCategories,
        isLoading,
        error,
        loadCategories,
        createCategory,
        updateCategory,
        deleteCategory,
      }}
    >
      {children}
    </CategoriesContext.Provider>
  );
};

export const useCategories = () => {
  const context = useContext(CategoriesContext);
  if (!context) {
    throw new Error('useCategories must be used within a CategoriesProvider');
  }
  return context;
};
