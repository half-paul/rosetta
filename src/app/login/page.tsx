'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

// UI-SPEC.md Copywriting Contract
const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin:
    'Incorrect email or password. Try again or contact your administrator.',
  OAuthAccountNotLinked:
    'No account found for this email. Rosetta uses invite-only access — contact your administrator.',
  OAuthSignin:
    'Sign-in failed. Try again or use email and password.',
  OAuthCallback:
    'Sign-in failed. Try again or use email and password.',
  SessionRequired:
    'Your session has expired. Please sign in again.',
  Default:
    'Incorrect email or password. Try again or contact your administrator.',
}

// Google logo SVG (simplified)
function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

// GitHub logo SVG
function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  )
}

export default function LoginPage() {
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<'google' | 'github' | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  // Read NextAuth error from URL search params (T-03-05: generic error messages)
  const urlError = searchParams.get('error')
  const errorMessage = urlError ? (ERROR_MESSAGES[urlError] ?? ERROR_MESSAGES.Default) : null

  // UI-SPEC.md Interaction Contract: on error, return focus to email field
  useEffect(() => {
    if (errorMessage && emailRef.current) {
      emailRef.current.focus()
    }
  }, [errorMessage])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // UI-SPEC.md: validate on submit only, not on keystroke
    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email || !password) return

    setIsLoading(true)
    try {
      await signIn('credentials', {
        email,
        password,
        redirectTo: '/dashboard',
      })
    } finally {
      setIsLoading(false)
    }
  }

  async function handleOAuth(provider: 'google' | 'github') {
    setOauthLoading(provider)
    try {
      await signIn(provider, { redirectTo: '/dashboard' })
    } finally {
      setOauthLoading(null)
    }
  }

  return (
    // UI-SPEC.md Layout Contract: page wrapper
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6">
        {/* UI-SPEC.md: floating header above card, not inside card */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your Rosetta account
          </p>
        </div>

        {/* UI-SPEC.md: Card with p-8 */}
        <Card className="p-8">
          <CardContent className="p-0 space-y-4">
            {/* UI-SPEC.md Accessibility: role="alert" for screen reader announcement */}
            {errorMessage && (
              <Alert variant="destructive" role="alert" className="mb-4">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Email field */}
              <div className="space-y-1">
                {/* UI-SPEC.md Accessibility: explicit Label for association */}
                <Label htmlFor="email">Email address</Label>
                <Input
                  ref={emailRef}
                  id="email"
                  name="email"
                  type="email"
                  autoFocus
                  required
                  autoComplete="email"
                  placeholder=""
                />
              </div>

              {/* Password field */}
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder=""
                />
              </div>

              {/* Submit button */}
              {/* UI-SPEC.md Accessibility: aria-disabled + aria-busy when loading */}
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                aria-disabled={isLoading ? 'true' : undefined}
                aria-busy={isLoading ? 'true' : undefined}
              >
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            {/* UI-SPEC.md: "or continue with" separator */}
            <div className="flex items-center gap-2">
              <Separator className="flex-1" />
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                or continue with
              </span>
              <Separator className="flex-1" />
            </div>

            {/* OAuth buttons — UI-SPEC.md: min-h-[44px] touch target, outline variant */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px] gap-2"
                disabled={oauthLoading !== null}
                onClick={() => handleOAuth('google')}
                aria-busy={oauthLoading === 'google' ? 'true' : undefined}
              >
                <GoogleIcon />
                {/* UI-SPEC.md Copywriting: exact text */}
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[44px] gap-2"
                disabled={oauthLoading !== null}
                onClick={() => handleOAuth('github')}
                aria-busy={oauthLoading === 'github' ? 'true' : undefined}
              >
                <GitHubIcon />
                Continue with GitHub
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
