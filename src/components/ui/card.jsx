export function Card({ className='', ...props }) {
  return <div className={'rounded-xl bg-white shadow-sm border border-gray-200 '+className} {...props}/>
}
export function CardHeader({ className='', ...props }) {
  return <div className={'p-4 border-b border-gray-100 '+className} {...props}/>
}
export function CardTitle({ className='', ...props }) {
  return <div className={'text-lg font-semibold '+className} {...props}/>
}
export function CardContent({ className='', ...props }) {
  return <div className={'p-4 '+className} {...props}/>
}
