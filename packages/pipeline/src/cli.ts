import { Command } from 'commander'
import { prepare } from './prepare'
new Command().name('lingo-pipeline').command('prepare').requiredOption('--clip <slug>').requiredOption('--source <s3uri>').requiredOption('--lang <de|en>').option('--native <codes>', 'comma-separated native languages', 'en,de,tr,ar,uk')
  .action(async (o) => { await prepare({ slug: o.clip, source: o.source, lang: o.lang, natives: String(o.native).split(',') }); process.exit(0) }).parent!.parseAsync()
