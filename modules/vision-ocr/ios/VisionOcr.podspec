require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'VisionOcr'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = 'https://github.com/princemahlaba27/redact-pdf'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/princemahlaba27/redact-pdf.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'UIKit', 'ImageIO'

  s.source_files = 'VisionOcrModule.swift'
end
