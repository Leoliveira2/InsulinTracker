import { cn } from '../../lib/utils.js'
export function Button({ as:Comp='button', className='', variant='default', size='md', ...props }) {
  const base='inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none'
  const variants={default:'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-600',
                  outline:'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus:ring-gray-400',
                  secondary:'bg-gray-800 text-white hover:bg-gray-900 focus:ring-gray-800'}
  const sizes={sm:'h-8 px-3 text-sm', md:'h-10 px-4', lg:'h-11 px-6 text-lg'}
  return <Comp className={cn(base,variants[variant]||variants.default,sizes[size]||sizes.md,className)} {...props}/>
}
