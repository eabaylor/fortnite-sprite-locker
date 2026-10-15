$ErrorActionPreference = 'Stop'
$assetRoot = 'https://fortnite.gg/img/x/sprites/icons/'
$artwork = @(
  @('Jonesy', 'Jonesy'), @('Adventure', 'Dwarf'), @('Bush', 'BushRanger'),
  @('Klombo', 'Klombo'), @('Spooky Dash', 'PhaseDash')
)
foreach ($entry in $artwork) {
  $filename = $entry[0].ToLower().Replace(' ', '-') + '-quack-256.webp'
  Invoke-WebRequest ($assetRoot + 'T_Icon_BR_Creature_Sprite_' + $entry[1] + '_Quack_L.webp') -OutFile (Join-Path 'public/sprites' $filename)
  Copy-Item (Join-Path 'public/sprites' $filename) (Join-Path 'docs/sprites' $filename)
}
$variants = @(@('base',''), @('gold','_Gold'), @('cheat-master','_Cheatmaster'), @('loot-hacker','_Hacker'), @('bounty-hunter','_BountyHunter'), @('trick-or-treat','_TrickTreat'))
foreach ($family in @(@('Honey','WinnerE'), @('One Wish Willow','CargoLying'))) {
  foreach ($variant in $variants) {
    $filename = $family[0].ToLower().Replace(' ', '-') + '-' + $variant[0] + '-256.webp'
    Invoke-WebRequest ($assetRoot + 'T_Icon_BR_Creature_Sprite_' + $family[1] + $variant[1] + '_L.webp') -OutFile (Join-Path 'public/sprites' $filename)
    Copy-Item (Join-Path 'public/sprites' $filename) (Join-Path 'docs/sprites' $filename)
  }
}
