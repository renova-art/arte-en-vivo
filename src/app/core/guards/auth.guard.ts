import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { FirebaseService } from '../services/firebase.service';

export const authGuard: CanActivateFn = async () => {
  const firebase = inject(FirebaseService);
  const router = inject(Router);
  return (await firebase.isLoggedIn()) ? true : router.createUrlTree(['/admin/login']);
};
