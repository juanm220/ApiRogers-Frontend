import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    BrowserRouter: ({ children }) => React.createElement(React.Fragment, null, children),
    Routes: ({ children }) => React.createElement(React.Fragment, null, children),
    Route: ({ element }) => element,
    Navigate: ({ to, children }) => React.createElement('div', { 'data-mock-navigate': to }, children),
    Link: ({ children, ...props }) => React.createElement('a', props, children),
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: '/' }),
    useParams: () => ({})
  };
}, { virtual: true });

import App from './App.jsx';

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  document.body.removeChild(container);
  container = null;
  root = null;
});

test('muestra la pantalla de login cuando no hay sesión', () => {
  window.localStorage.clear();

  act(() => {
    root.render(<App />);
  });

  const heading = container.querySelector('h2');
  expect(heading).not.toBeNull();
  expect(heading.textContent).toMatch(/iniciar sesión/i);
});
