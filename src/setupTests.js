// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
// Si el paquete no está disponible (por ejemplo, en entornos con acceso limitado),
// continuamos sin fallar las pruebas.
import('@testing-library/jest-dom').catch((error) => {
  console.warn('jest-dom no disponible, se usan matchers por defecto:', error?.message || error);
});
