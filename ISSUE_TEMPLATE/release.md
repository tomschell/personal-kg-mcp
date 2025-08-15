---
name: Release
about: Create a new release
title: 'Release v[VERSION]'
labels: 'release'
assignees: 'tomschell'
---

## Release v[VERSION]

### 🎯 Release Goals
- [ ] Complete all planned features
- [ ] Run full test suite
- [ ] Update documentation
- [ ] Create release notes
- [ ] Publish to NPM
- [ ] Create GitHub release

### 📋 Pre-Release Checklist
- [ ] All tests passing
- [ ] Build successful
- [ ] Documentation updated
- [ ] Version bumped
- [ ] Changelog updated
- [ ] Release notes prepared

### 🚀 Release Steps
1. Create release branch: `git checkout -b release/v[VERSION]`
2. Update version in package.json
3. Update CHANGELOG.md
4. Run tests: `npm test`
5. Build: `npm run build`
6. Create tag: `git tag v[VERSION]`
7. Push tag: `git push origin v[VERSION]`
8. Monitor CI/CD pipeline
9. Verify NPM publication
10. Create GitHub release

### 📝 Release Notes Template
```markdown
## v[VERSION] - [DATE]

### 🎉 New Features
- 

### 🔧 Improvements
- 

### 🐛 Bug Fixes
- 

### 📚 Documentation
- 

### 🔄 Breaking Changes
- None

### 📦 Installation
```bash
npm install personal-kg-mcp@[VERSION]
```
```

### �� Related Issues
- 
