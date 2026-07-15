import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        // Map sign-up params to the auth users table.
        // Only 'name' and 'email' are available on the auth users table;
        // role/displayName are stored in userProfiles separately.
        return {
          email: params.email as string,
          name: (params.displayName as string) ?? (params.email as string),
        };
      },
    }),
  ],
});
