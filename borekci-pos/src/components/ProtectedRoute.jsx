import React, { memo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

const ProtectedRoute = memo(({ children, user, requiredRole = null }) => {
  const location = useLocation();

  // Kullanıcı yoksa login'e yönlendir
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Rol kontrolü varsa ve kullanıcının rolü uygun değilse ana sayfaya yönlendir
  if (requiredRole && user.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
});

ProtectedRoute.displayName = 'ProtectedRoute';

export default ProtectedRoute;

