import { cn } from '../../lib/utils.js'

export function Badge({ className='', variant='default', ...props }) {
  const variants = {
    default: 'bg-gray-900 text-white',
    secondary: 'bg-gray-100 text-gray-900 border border-gray-200'
  }
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        variants[variant] || variants.default,
        className
      )}
      {...props}
    />
  )
}
