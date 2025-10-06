// src/redux/slides/productsSlice.js
import { createSlice } from '@reduxjs/toolkit';

/** 
 * We'll store an array of standardProducts. 
 * You can set a default set or load them from an API on startup.
 */
const initialState = {
  standardProducts: []
};

const productsSlice = createSlice({
  name: 'products',
  initialState,
  reducers: {
    /** Set the entire array of standard products */
    setStandardProducts: (state, action) => {
      state.standardProducts = action.payload;
    },
    /** Add a new product to the array if it doesn't exist */
    addStandardProduct: (state, action) => {
      const newProd = action.payload.trim();
      if (newProd && !state.standardProducts.includes(newProd)) {
        state.standardProducts.push(newProd);
      }
    },
    /** Remove a product by name */
    removeStandardProduct: (state, action) => {
      const prodToRemove = action.payload;
      state.standardProducts = state.standardProducts.filter(p => p !== prodToRemove);
    }
  }
});

export const { setStandardProducts, addStandardProduct, removeStandardProduct } = productsSlice.actions;
export default productsSlice.reducer;
