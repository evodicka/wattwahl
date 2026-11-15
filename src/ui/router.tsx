import type { ReactNode } from 'react';
import { createHashRouter, Navigate, type RouteObject } from 'react-router';
import { ErgebnisPage } from './areas/ErgebnisPage';
import { FahrprofilPage } from './areas/FahrprofilPage';
import { KandidatenPage } from './areas/KandidatenPage';
import { ParameterPage } from './areas/ParameterPage';
import { SzenarienPage } from './areas/SzenarienPage';
import { AppShell } from './shell/AppShell';
import { AreaBoundary } from './shell/AreaBoundary';
import type { Area, AreaHandle } from './shell/areas';
import { RouteError } from './shell/RouteError';

const area = (name: Area, page: ReactNode) => ({
  handle: { area: name } satisfies AreaHandle,
  element: <AreaBoundary area={name}>{page}</AreaBoundary>,
});

const home = <Navigate to="/fahrprofil" replace />;

/** Routes of architecture 8.8; unknown paths lead to the first area. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: home },
      { path: 'fahrprofil', ...area('fahrprofil', <FahrprofilPage />) },
      { path: 'kandidaten', ...area('kandidaten', <KandidatenPage />) },
      { path: 'kandidaten/:id', ...area('kandidaten', <KandidatenPage />) },
      { path: 'parameter', ...area('parameter', <ParameterPage />) },
      { path: 'ergebnis', ...area('ergebnis', <ErgebnisPage />) },
      { path: 'ergebnis/:offerId', ...area('ergebnis', <ErgebnisPage />) },
      { path: 'szenarien', ...area('szenarien', <SzenarienPage />) },
      { path: '*', element: home },
    ],
  },
];

/** The app's router: hash routing, because GitHub Pages serves only files (4.2). */
export const createAppRouter = () => createHashRouter(routes);

export type AppRouter = ReturnType<typeof createAppRouter>;
